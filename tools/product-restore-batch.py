#!/usr/bin/env python3
"""Deterministic local product cutout restoration batch (Real-ESRGAN + classical ops)."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parent
BATCH_ROOT = TOOLS_DIR / ".product-restore-batch"
BINARY_PATH = TOOLS_DIR / "realesrgan-bin" / "realesrgan-ncnn-vulkan.exe"
MODEL_NAME = "realesrgan-x4plus"
NATIVE_SCALE = 4
SKIP_SLUGS = {"source-2408-sets-of-propeller-with-adaptor"}
PREVIEW_BG = (245, 245, 245, 255)
MIN_MASKED_SSIM = 0.82


def load_env() -> None:
    for name in (".env.local", ".env"):
        path = PROJECT_ROOT / name
        if not path.exists():
            continue
        raw = path.read_text(encoding="utf-8-sig")
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip().lstrip("\ufeff")
            if key and key not in os.environ:
                os.environ[key] = value.strip().strip('"').strip("'")


def load_validator():
    spec = importlib.util.spec_from_file_location(
        "validate_enhanced_images",
        TOOLS_DIR / "validate-enhanced-images.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load validate-enhanced-images.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


VALIDATOR = load_validator()

DEFRINGE_BACKGROUND = (250, 250, 250)
DEFRINGE_LUMA_THRESHOLD = 200
DEFRINGE_ALPHA_CEILING = 220


def erode_alpha_channel(alpha_u8: np.ndarray, radius: int = 1) -> np.ndarray:
    if radius <= 0:
        return alpha_u8
    size = radius * 2 + 1
    alpha_img = Image.fromarray(alpha_u8.astype(np.uint8), mode="L")
    return np.array(alpha_img.filter(ImageFilter.MinFilter(size)), dtype=np.uint8)


def defringe_light_halo(image: Image.Image) -> Image.Image:
    rgba = np.array(image.convert("RGBA"), dtype=np.float32)
    rgb = rgba[:, :, :3]
    alpha_u8 = rgba[:, :, 3].astype(np.uint8)
    alpha = alpha_u8.astype(np.float32) / 255.0
    luma = rgb.mean(axis=2)
    semi_halo = (alpha_u8 > 0) & (alpha_u8 < DEFRINGE_ALPHA_CEILING) & (luma > DEFRINGE_LUMA_THRESHOLD)
    if not np.any(semi_halo):
        return image
    bg = np.array(DEFRINGE_BACKGROUND, dtype=np.float32)
    alpha_safe = np.maximum(alpha, 1.0 / 255.0)
    fg_rgb = (rgb - (1.0 - alpha[..., None]) * bg) / alpha_safe[..., None]
    fg_rgb = np.clip(fg_rgb, 0, 255)
    out_rgb = np.where(semi_halo[..., None], fg_rgb, rgb)
    eroded_alpha = erode_alpha_channel(alpha_u8, radius=1)
    out_alpha = np.where(semi_halo, np.minimum(alpha_u8, eroded_alpha), alpha_u8)
    post_luma = out_rgb.mean(axis=2)
    residual_halo = (out_alpha > 0) & (out_alpha < DEFRINGE_ALPHA_CEILING) & (post_luma > (DEFRINGE_LUMA_THRESHOLD - 25))
    out_rgb = np.where(residual_halo[..., None], out_rgb * 0.72, out_rgb)
    out_alpha = np.where(
        residual_halo,
        (out_alpha.astype(np.float32) * 0.65).astype(np.uint8),
        out_alpha,
    )
    result = np.dstack([out_rgb, out_alpha.astype(np.float32)]).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def metrics_for(image: Image.Image) -> dict:
    rgba = np.array(image.convert("RGBA"))
    alpha = rgba[:, :, 3]
    bbox = alpha_bbox(alpha)
    coverage = float(np.count_nonzero(alpha > 8)) / float(alpha.size)
    semi = (alpha > 0) & (alpha < 220)
    semi_count = int(np.count_nonzero(semi))
    luma = rgba[:, :, :3].astype(np.float32).mean(axis=2)
    halo_count = int(np.count_nonzero(semi & (luma > 242) & (alpha < 180)))
    halo_ratio = float(halo_count) / float(semi_count) if semi_count else 0.0
    corner_alpha = int(alpha[:12, :12].max())
    corner_alpha = max(corner_alpha, int(alpha[-12:, :12].max()))
    corner_alpha = max(corner_alpha, int(alpha[:12, -12:].max()))
    corner_alpha = max(corner_alpha, int(alpha[-12:, -12:].max()))
    return {
        "coverage": round(coverage, 5),
        "haloRatio": round(halo_ratio, 5),
        "cornerAlphaMax": corner_alpha,
        "semiTransparentPixels": semi_count,
        "bbox": list(bbox) if bbox else None,
    }


def fetch_cutout_catalog() -> list[dict]:
    load_env()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    links_endpoint = (
        f"{url.rstrip('/')}/rest/v1/product_media_assets"
        "?select=product_slug,media_asset_id,sort_order"
        "&usage=eq.cms"
        "&variant_id=eq.catalog-cutout-v1"
        "&order=sort_order.asc"
        "&limit=1000"
    )
    with urllib.request.urlopen(urllib.request.Request(links_endpoint, headers=headers), timeout=120) as response:
        links = json.loads(response.read().decode("utf-8"))

    media_ids = sorted({row["media_asset_id"] for row in links if row.get("media_asset_id")})
    media_by_id: dict[str, dict] = {}
    if media_ids:
        ids_filter = ",".join(media_ids)
        media_endpoint = (
            f"{url.rstrip('/')}/rest/v1/media_assets"
            f"?select=id,public_url,storage_path"
            f"&id=in.({ids_filter})"
            f"&limit={len(media_ids)}"
        )
        with urllib.request.urlopen(urllib.request.Request(media_endpoint, headers=headers), timeout=120) as response:
            for row in json.loads(response.read().decode("utf-8")):
                media_by_id[row["id"]] = row

    products_endpoint = f"{url.rstrip('/')}/rest/v1/mithron_products?select=slug,name&limit=500"
    with urllib.request.urlopen(urllib.request.Request(products_endpoint, headers=headers), timeout=120) as response:
        names = {row["slug"]: row.get("name") or row["slug"] for row in json.loads(response.read().decode("utf-8"))}

    best: dict[str, dict] = {}
    for link in links:
        slug = (link.get("product_slug") or "").strip()
        media_id = link.get("media_asset_id")
        if not slug or slug in SKIP_SLUGS or not media_id:
            continue
        media = media_by_id.get(media_id)
        if not media:
            continue
        cutout_url = (media.get("public_url") or "").strip()
        storage_path = (media.get("storage_path") or "").strip()
        if "/catalog-cutouts/" not in cutout_url and "/catalog-cutouts/" not in storage_path:
            continue
        sort_order = link.get("sort_order") or 0
        current = best.get(slug)
        if current is None or sort_order < current["sort_order"]:
            best[slug] = {
                "slug": slug,
                "name": names.get(slug, slug),
                "cutout_url": cutout_url,
                "sort_order": sort_order,
            }

    return [best[slug] for slug in sorted(best.keys())]


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        destination.write_bytes(response.read())


def alpha_bbox(alpha: np.ndarray, threshold: int = 8) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(alpha > threshold)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def has_meaningful_alpha(rgba: Image.Image) -> bool:
    alpha = np.array(rgba.getchannel("A"))
    coverage = float(np.count_nonzero(alpha > 8)) / float(alpha.size)
    return coverage > 0.02 and coverage < 0.98


def ensure_alpha_mask(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    if has_meaningful_alpha(rgba):
        return rgba

    try:
        from rembg import new_session, remove

        session = new_session("isnet-general-use")
        cut = remove(rgba, session=session, alpha_matting=True)
        return cut.convert("RGBA")
    except Exception as error:
        raise RuntimeError(f"rembg unavailable and image has no alpha: {error}") from error


def detect_promo_overlay(rgba: Image.Image) -> bool:
    """Reject only obvious promo slides with large text bands (not product cutouts)."""
    arr = np.array(rgba.convert("RGBA"))
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3].astype(np.float32)
    luma = rgb.mean(axis=2)
    opaque = alpha > 200
    if not np.any(opaque):
        return False
    upper = opaque & (np.arange(arr.shape[0])[:, None] < arr.shape[0] * 0.28)
    if float(np.count_nonzero(upper)) < arr.shape[0] * arr.shape[1] * 0.05:
        return False
    # Require both very bright and very dark text-like pixels in upper band
    dark_text = upper & (luma < 25)
    bright_text = upper & (luma > 248)
    text_pixels = np.count_nonzero(dark_text) + np.count_nonzero(bright_text)
    upper_pixels = np.count_nonzero(upper)
    text_ratio = float(text_pixels) / float(upper_pixels)
    return text_ratio > 0.22


def bilateral_denoise_rgb(rgb: np.ndarray) -> np.ndarray:
    return cv2.bilateralFilter(rgb, d=5, sigmaColor=18, sigmaSpace=18)


def apply_neutral_lighting(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    mask = alpha > 8
    if not np.any(mask):
        return rgb
    out = rgb.astype(np.float32).copy()
    means = out[mask].mean(axis=0)
    target = 128.0
    scale = np.clip(target / np.maximum(means, 1.0), 0.92, 1.08)
    out[mask] = np.clip(out[mask] * scale, 0, 255)

    lab = cv2.cvtColor(out.astype(np.uint8), cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8))
    l2 = clahe.apply(l)
    l2 = np.clip(l2.astype(np.float32) * 1.02 + 2.0, 0, 255).astype(np.uint8)
    merged = cv2.merge([l2, a, b])
    corrected = cv2.cvtColor(merged, cv2.COLOR_LAB2RGB)
    result = rgb.astype(np.float32)
    blend = 0.35
    result[mask] = result[mask] * (1 - blend) + corrected[mask].astype(np.float32) * blend
    return np.clip(result, 0, 255).astype(np.uint8)


def run_realesrgan(binary: Path, input_png: Path, output_png: Path) -> None:
    models_dir = binary.parent / "models"
    command = [
        str(binary),
        "-i",
        str(input_png),
        "-o",
        str(output_png),
        "-n",
        MODEL_NAME,
        "-s",
        str(NATIVE_SCALE),
        "-f",
        "png",
    ]
    if models_dir.exists():
        command.extend(["-m", str(models_dir)])
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"Real-ESRGAN failed: {detail}")


def masked_ssim(original_rgb: np.ndarray, restored_rgb: np.ndarray, alpha: np.ndarray) -> float:
    mask = alpha > 8
    if not np.any(mask):
        return 0.0
    a = original_rgb[mask].astype(np.float32)
    b = restored_rgb[mask].astype(np.float32)
    mu_a, mu_b = a.mean(), b.mean()
    var_a = ((a - mu_a) ** 2).mean()
    var_b = ((b - mu_b) ** 2).mean()
    cov = ((a - mu_a) * (b - mu_b)).mean()
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    num = (2 * mu_a * mu_b + c1) * (2 * cov + c2)
    den = (mu_a**2 + mu_b**2 + c1) * (var_a + var_b + c2)
    return float(num / den) if den else 0.0


def add_contact_shadow(rgba: Image.Image) -> Image.Image:
    arr = np.array(rgba.convert("RGBA"))
    alpha = arr[:, :, 3]
    bbox = alpha_bbox(alpha)
    if not bbox:
        return rgba
    x0, y0, x1, y1 = bbox
    shadow = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    cx = (x0 + x1) // 2
    base_y = y1 - max(4, int((y1 - y0) * 0.02))
    rx = max(24, int((x1 - x0) * 0.22))
    ry = max(6, int((y1 - y0) * 0.03))
    draw.ellipse((cx - rx, base_y, cx + rx, base_y + ry * 2), fill=(0, 0, 0, 38))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=6))
    base = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    base.alpha_composite(shadow)
    base.alpha_composite(rgba)
    return base


def restore_image(
    source_path: Path,
    *,
    binary: Path,
    contact_shadow: bool,
) -> tuple[Image.Image, dict]:
    with Image.open(source_path) as loaded:
        loaded.load()
        original_size = loaded.size
        rgba = ensure_alpha_mask(loaded)

    if detect_promo_overlay(rgba):
        raise RuntimeError("promo_text_overlay_detected")

    original_alpha = np.array(rgba.getchannel("A"))
    original_rgb = np.array(rgba.convert("RGB"))

    rgb = bilateral_denoise_rgb(original_rgb)
    rgb = apply_neutral_lighting(rgb, original_alpha)

    with tempfile.TemporaryDirectory(prefix="mithron-restore-") as temp_dir:
        temp = Path(temp_dir)
        input_png = temp / "input.png"
        output_png = temp / "output.png"
        Image.fromarray(rgb, mode="RGB").save(input_png, format="PNG")
        run_realesrgan(binary, input_png, output_png)

        with Image.open(output_png) as enhanced:
            enhanced.load()
            restored_rgb = np.array(enhanced.convert("RGB").resize(original_size, Image.Resampling.LANCZOS))

    # Lock silhouette to original alpha
    out_rgba = np.dstack([restored_rgb, original_alpha]).astype(np.uint8)
    result = Image.fromarray(out_rgba, mode="RGBA")
    result = defringe_light_halo(result)

    if contact_shadow:
        result = add_contact_shadow(result)

    ssim = masked_ssim(original_rgb, restored_rgb, original_alpha)
    metrics = metrics_for(result)
    metrics["maskedSsim"] = round(ssim, 4)

    if result.size != original_size:
        raise RuntimeError(f"size_mismatch {result.size} != {original_size}")
    if ssim < MIN_MASKED_SSIM:
        raise RuntimeError(f"ssim_too_low {ssim:.4f}")

    # Artifact validation on flattened preview rgb
    flat_path = Path(tempfile.mkdtemp(prefix="mithron-validate-")) / "flat.png"
    try:
        flat = Image.new("RGB", result.size, PREVIEW_BG[:3])
        flat.paste(result, mask=result.split()[3])
        flat.save(flat_path, format="PNG")
        validation = VALIDATOR.validate_image(flat_path, VALIDATOR.DEFAULT_TILE_SIZES, source_path)
    finally:
        if flat_path.exists():
            flat_path.unlink(missing_ok=True)
            try:
                flat_path.parent.rmdir()
            except OSError:
                pass

    if not validation["passed"]:
        raise RuntimeError(f"artifact_validation_failed seam={validation['seamScore']}")

    if metrics.get("haloRatio", 0) > 0.72:
        raise RuntimeError(f"halo_ratio_too_high {metrics.get('haloRatio')}")

    return result, metrics


def process_item(item: dict, *, binary: Path, contact_shadow: bool, force: bool) -> dict:
    slug = item["slug"]
    name = item["name"]
    cutout_url = item["cutout_url"]
    out_dir = BATCH_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    before_path = out_dir / "before.webp"
    basename = before_path.stem
    restored_path = out_dir / f"{basename}.restored.png"
    preview_path = out_dir / f"{basename}.restored-preview.png"
    metrics_path = out_dir / "metrics.json"

    if restored_path.exists() and not force:
        return {
            "slug": slug,
            "name": name,
            "status": "skipped_exists",
            "restoredPath": str(restored_path),
            "previewPath": str(preview_path),
        }

    try:
        if not before_path.exists() or force:
            download_file(cutout_url, before_path)

        restored, metrics = restore_image(before_path, binary=binary, contact_shadow=contact_shadow)
        restored.save(restored_path, format="PNG", compress_level=6)

        preview = Image.new("RGBA", restored.size, PREVIEW_BG)
        preview.alpha_composite(restored)
        preview.convert("RGB").save(preview_path, format="PNG", compress_level=6)

        metrics_payload = {
            "slug": slug,
            "name": name,
            "engine": "realesrgan-x4plus + classical-restore",
            "width": restored.width,
            "height": restored.height,
            "inputBytes": before_path.stat().st_size,
            "outputBytes": restored_path.stat().st_size,
            "metrics": metrics,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }
        metrics_path.write_text(json.dumps(metrics_payload, indent=2), encoding="utf-8")

        return {
            "slug": slug,
            "name": name,
            "status": "restored",
            "cutoutUrl": cutout_url,
            "beforePath": str(before_path),
            "restoredPath": str(restored_path),
            "previewPath": str(preview_path),
            "metricsPath": str(metrics_path),
            "width": restored.width,
            "height": restored.height,
            "inputBytes": metrics_payload["inputBytes"],
            "outputBytes": metrics_payload["outputBytes"],
            "maskedSsim": metrics.get("maskedSsim"),
            "haloRatio": metrics.get("haloRatio"),
        }
    except Exception as error:
        return {
            "slug": slug,
            "name": name,
            "status": "rejected",
            "reason": str(error),
            "cutoutUrl": cutout_url,
            "beforePath": str(before_path),
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Batch restore catalog product cutouts locally.")
    parser.add_argument("--fetch-supabase", action="store_true", help="Fetch all catalog cutouts from Supabase.")
    parser.add_argument("--slug", action="append", default=[], help="Process specific product slug (repeatable).")
    parser.add_argument("--parallel", type=int, default=6, help="Parallel worker count.")
    parser.add_argument("--contact-shadow", action="store_true", default=True, help="Add soft contact shadow.")
    parser.add_argument("--no-contact-shadow", action="store_true", help="Disable contact shadow.")
    parser.add_argument("--force", action="store_true", help="Reprocess even if output exists.")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of items (0 = all).")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    contact_shadow = args.contact_shadow and not args.no_contact_shadow

    if not BINARY_PATH.exists():
        print(f"Real-ESRGAN binary missing: {BINARY_PATH}", file=sys.stderr)
        print("Run: node -e \"import('./tools/realesrgan-binary.mjs').then(m=>m.ensureRealEsrganBinary())\"", file=sys.stderr)
        return 1

    if args.fetch_supabase:
        items = fetch_cutout_catalog()
    elif args.slug:
        load_env()
        catalog = {row["slug"]: row for row in fetch_cutout_catalog()}
        items = [catalog[slug] for slug in args.slug if slug in catalog]
        missing = [slug for slug in args.slug if slug not in catalog]
        if missing:
            print(f"Warning: slugs not found: {missing}", file=sys.stderr)
    else:
        print("Provide --fetch-supabase or --slug", file=sys.stderr)
        return 1

    if args.limit > 0:
        items = items[: args.limit]

    BATCH_ROOT.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []
    workers = max(1, min(args.parallel, 8))

    if workers == 1 or len(items) == 1:
        for item in items:
            results.append(process_item(item, binary=BINARY_PATH, contact_shadow=contact_shadow, force=args.force))
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(
                    process_item,
                    item,
                    binary=BINARY_PATH,
                    contact_shadow=contact_shadow,
                    force=args.force,
                ): item
                for item in items
            }
            for future in as_completed(futures):
                results.append(future.result())

    results.sort(key=lambda row: row.get("slug", ""))
    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "engine": "realesrgan-x4plus-local-deterministic",
        "batchRoot": str(BATCH_ROOT),
        "processed": len(results),
        "restored": sum(1 for r in results if r["status"] == "restored"),
        "rejected": sum(1 for r in results if r["status"] == "rejected"),
        "skipped": sum(1 for r in results if r["status"] == "skipped_exists"),
        "items": results,
        "nextForApproval": next(
            (r for r in results if r["status"] == "restored"),
            None,
        ),
    }

    report_path = BATCH_ROOT / "report.json"
    report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0 if summary["rejected"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
