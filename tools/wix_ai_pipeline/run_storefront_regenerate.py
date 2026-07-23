#!/usr/bin/env python3
"""
E-commerce storefront product regeneration (identity-locked).

  cutout (transparent) → Real-ESRGAN detail restore → 1000×1000 center → WebP

Hard rules:
  - Exact product identity (no SD redesign / no invented parts)
  - True alpha cutout, defringed
  - Always 1000×1000, aspect preserved, centered margins
  - WebP sRGB alpha, target ~100–140 KB

Usage:
  python -u tools/wix_ai_pipeline/run_storefront_regenerate.py --input path/to.png
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parent.parent
sys.path.insert(0, str(TOOLS_DIR.parent))

from wix_ai_pipeline.cutout import (  # noqa: E402
    bria_cutout,
    cage_cutout,
    release_cutout_session,
    remove_orphan_bg_blobs,
    validate_alpha,
)
from wix_ai_pipeline.detail_generative import generative_macro_detail  # noqa: E402
from wix_ai_pipeline.enhance import enhance_image  # noqa: E402
from wix_ai_pipeline.export_web import (  # noqa: E402
    STOREFRONT_SIDE,
    save_png_master,
)
from wix_ai_pipeline.gpu_setup import preload_cuda_dlls  # noqa: E402
from wix_ai_pipeline.square_canvas import content_bbox, fit_cutout_to_square  # noqa: E402

MARGIN_RATIO = 0.08
WEBP_TARGET_MIN = 100 * 1024
WEBP_TARGET_MAX = 140 * 1024


def checkerboard_preview(cutout: Image.Image, tile: int = 40) -> Image.Image:
    chk = Image.new("RGB", cutout.size, (220, 220, 220))
    dark = (180, 180, 180)
    for y in range(0, cutout.height, tile):
        for x in range(0, cutout.width, tile):
            if ((x // tile) + (y // tile)) % 2 == 0:
                chk.paste(dark, (x, y, min(x + tile, cutout.width), min(y + tile, cutout.height)))
    preview = chk.convert("RGBA")
    preview.alpha_composite(cutout.convert("RGBA"))
    return preview.convert("RGB")


def crop_to_product(cutout: Image.Image) -> Image.Image:
    rgba = cutout.convert("RGBA")
    bbox = content_bbox(rgba) or rgba.getbbox()
    if not bbox:
        return rgba
    return rgba.crop(bbox)


def enhance_preserve_aspect(product: Image.Image, max_inner: int) -> Image.Image:
    """Real-ESRGAN restore → target max side, never stretch aspect."""
    w, h = product.size
    if w <= 0 or h <= 0:
        return product
    scale = max_inner / float(max(w, h))
    # Always allow ESRGAN headroom on tiny sources (182px → 840+)
    tw = max(1, int(round(w * scale)))
    th = max(1, int(round(h * scale)))
    return enhance_image(product, target_size=(tw, th))


def save_webp_budget(
    image: Image.Image,
    path: Path,
    *,
    target_min: int = WEBP_TARGET_MIN,
    target_max: int = WEBP_TARGET_MAX,
) -> dict:
    """
    Encode RGBA WebP aiming for target_min–target_max bytes.
    Prefer highest quality that stays ≤ target_max; if under target_min, keep best quality.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    if image.size != (STOREFRONT_SIDE, STOREFRONT_SIDE):
        raise ValueError(f"Expected {STOREFRONT_SIDE}×{STOREFRONT_SIDE}, got {image.size}")

    # Try high → low; pick best under max
    candidates: list[tuple[int, int]] = []  # (quality, size)
    for q in range(94, 78, -1):
        image.save(path, "WEBP", quality=q, method=6, lossless=False)
        size = path.stat().st_size
        candidates.append((q, size))
        if size <= target_max and size >= target_min:
            return {
                "path": str(path),
                "width": STOREFRONT_SIDE,
                "height": STOREFRONT_SIDE,
                "quality": q,
                "file_size_bytes": size,
                "in_budget": True,
                "target_min_bytes": target_min,
                "target_max_bytes": target_max,
            }

    # Prefer highest quality with size ≤ max (under min is OK — mostly transparent canvases)
    under = [(q, s) for q, s in candidates if s <= target_max]
    if under:
        q, size = max(under, key=lambda t: (t[0], t[1]))
    else:
        q, size = min(candidates, key=lambda t: t[1])
    image.save(path, "WEBP", quality=q, method=6, lossless=False)
    # Under target_min at max quality is acceptable (sparse alpha → small files)
    in_budget = size <= target_max and (size >= target_min or q >= 92)
    return {
        "path": str(path),
        "width": STOREFRONT_SIDE,
        "height": STOREFRONT_SIDE,
        "quality": q,
        "file_size_bytes": size,
        "in_budget": in_budget,
        "target_min_bytes": target_min,
        "target_max_bytes": target_max,
    }


def _do_cutout(image: Image.Image, mode: str, model: str) -> tuple[Image.Image, str]:
    if mode == "cage":
        cutout = cage_cutout(image, model=model)
        method = f"cage:{model}"
    else:
        cutout = bria_cutout(image, model=model, preserve_holes=False, defringe="strong")
        method = f"solid:{model}"
        cutout = Image.fromarray(
            remove_orphan_bg_blobs(np.array(cutout.convert("RGBA"))), "RGBA"
        )
    return cutout, method


def regenerate(
    input_path: Path,
    out_dir: Path,
    *,
    model: str,
    mode: str,
    side: int = STOREFRONT_SIDE,
    margin_ratio: float = MARGIN_RATIO,
    generative: bool = True,
    strength: float = 0.45,
    backend: str = "gemini",
) -> dict:
    """
    backend:
      gemini — Google Gemini Flash Image restore (cloud), then BiRefNet cutout
      sd     — local SD/Realistic Vision img2img on RTX
      none   — cutout + ESRGAN only
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    export_dir = out_dir / "export"
    export_dir.mkdir(parents=True, exist_ok=True)

    if not generative:
        backend = "none"

    gpu = preload_cuda_dlls()
    print(
        json.dumps(
            {
                k: gpu.get(k)
                for k in ("ort_version", "providers", "gpu_preferred", "cublas_found")
            },
            indent=2,
        )
    )

    src = Image.open(input_path)
    src.load()
    print(f"0/5 Source {src.size} mode={src.mode} backend={backend}")
    save_png_master(src.convert("RGBA"), out_dir / "00-source.png")

    max_inner = int(side * (1.0 - 2 * margin_ratio))
    gen_meta: dict = {"enabled": backend != "none", "backend": backend, "mode_used": "skipped"}
    method = "pending"
    ok, issues = True, []
    enhanced: Image.Image

    if backend == "gemini":
        print("1/5 Gemini Flash Image restore (identity-locked macro detail)...")
        from wix_ai_pipeline.detail_gemini import generative_macro_detail_gemini

        gem = generative_macro_detail_gemini(src.convert("RGB"))
        gen_meta = {
            "enabled": True,
            "backend": "gemini",
            "mode_used": gem.mode_used,
            "model": gem.model,
            "notes": gem.notes,
        }
        print(f"  mode={gem.mode_used} notes={gem.notes}")
        save_png_master(gem.image, out_dir / "01-gemini-restore.png")
        if not gem.mode_used.startswith("gemini_"):
            print("  Gemini failed — falling back to cutout+ESRGAN on source")
            work = src
        else:
            work = gem.image

        print(f"2/5 Cutout (mode={mode}, model={model}) — transparent alpha...")
        cutout, method = _do_cutout(work, mode, model)
        ok, issues = validate_alpha(cutout)
        print(f"  method={method} alpha_ok={ok} issues={issues}")
        save_png_master(cutout, out_dir / "02-cutout.png")

        print("3/5 Light ESRGAN polish to storefront inner size...")
        product = crop_to_product(cutout)
        if max(product.size) < max_inner * 0.95:
            enhanced = enhance_preserve_aspect(product, max_inner=max_inner)
            a_hi = product.getchannel("A").resize(enhanced.size, Image.Resampling.LANCZOS)
            enhanced = enhanced.convert("RGBA")
            enhanced.putalpha(a_hi)
        else:
            enhanced = product.convert("RGBA")
        save_png_master(enhanced, out_dir / "03-enhanced-cutout.png")
        print(f"  size={enhanced.size}")

    else:
        print(f"1/5 Cutout (mode={mode}, model={model}) — transparent alpha...")
        cutout, method = _do_cutout(src, mode, model)
        ok, issues = validate_alpha(cutout)
        print(f"  method={method} alpha_ok={ok} issues={issues}")
        save_png_master(cutout, out_dir / "01-cutout-native.png")

        product = crop_to_product(cutout)
        enhanced = product.convert("RGBA")

        if backend == "sd":
            print(f"2/5 SD img2img strength={strength:.2f} on RTX -> then ESRGAN amplify...")
            release_cutout_session()
            sd_prep = enhance_preserve_aspect(product, max_inner=min(480, max_inner))
            a_prep = product.getchannel("A").resize(sd_prep.size, Image.Resampling.LANCZOS)
            sd_prep = sd_prep.convert("RGBA")
            sd_prep.putalpha(a_prep)
            save_png_master(sd_prep, out_dir / "02-sd-prep.png")

            detail = generative_macro_detail(
                sd_prep, strength=strength, detail_mix=0.90, refine=True
            )
            gen_meta = {
                "enabled": True,
                "backend": "sd",
                "mode_used": detail.mode_used,
                "strength": detail.strength,
                "sd_side": detail.sd_side,
                "notes": detail.notes,
            }
            print(f"  mode={detail.mode_used} notes={detail.notes}")
            if detail.mode_used.startswith("sd_"):
                gen_crop = crop_to_product(detail.image)
                save_png_master(gen_crop, out_dir / "03a-sd-detail.png")
                enhanced = enhance_preserve_aspect(gen_crop, max_inner=max_inner)
                a_hi = gen_crop.getchannel("A").resize(enhanced.size, Image.Resampling.LANCZOS)
                enhanced = enhanced.convert("RGBA")
                enhanced.putalpha(a_hi)
            else:
                enhanced = enhance_preserve_aspect(product, max_inner=max_inner)
                a_ref = product.getchannel("A").resize(enhanced.size, Image.Resampling.LANCZOS)
                enhanced = enhanced.convert("RGBA")
                enhanced.putalpha(a_ref)
            save_png_master(enhanced, out_dir / "03-generative-amplified.png")
            print(f"  size={enhanced.size}")
        else:
            print("2/5 Generative SKIPPED — ESRGAN-only")
            enhanced = enhance_preserve_aspect(product, max_inner=max_inner)
            a_ref = product.getchannel("A").resize(enhanced.size, Image.Resampling.LANCZOS)
            enhanced = enhanced.convert("RGBA")
            enhanced.putalpha(a_ref)
            save_png_master(enhanced, out_dir / "03-generative-amplified.png")
            print(f"  size={enhanced.size}")

    print(f"4/5 Fit {side}x{side} centered (margin={margin_ratio:.0%})...")
    final = fit_cutout_to_square(enhanced, side=side, margin_ratio=margin_ratio)
    if final.size != (side, side):
        final = final.resize((side, side), Image.Resampling.LANCZOS)
    save_png_master(final, out_dir / "04-final-1000.png")
    save_png_master(checkerboard_preview(final), out_dir / "04-final-1000.preview.png")
    print(f"  -> {final.size}")

    print("5/5 WebP export (100-140 KB target)...")
    webp_path = export_dir / "product-cutout.webp"
    web_meta = save_webp_budget(final, webp_path)
    kb = web_meta["file_size_bytes"] / 1024
    print(
        f"  -> {webp_path} q={web_meta['quality']} "
        f"{kb:.1f} KB in_budget={web_meta['in_budget']}"
    )

    enhancer = {
        "gemini": "gemini-2.5-flash-image+birefnet+realesrgan",
        "sd": "realesrgan+sd_img2img",
        "none": "realesrgan-x4plus",
    }.get(backend, backend)

    report = {
        "pipeline": "storefront_regenerate_v3",
        "identity_locked": True,
        "backend": backend,
        "generative_macro_detail": gen_meta,
        "enhancer": enhancer,
        "input": str(input_path),
        "mode": mode,
        "model": model,
        "method": method,
        "alpha_ok": ok,
        "alpha_issues": issues,
        "source_size": list(src.size),
        "final_size": list(final.size),
        "gpu": {
            k: gpu.get(k)
            for k in ("ort_version", "providers", "gpu_preferred", "cublas_found")
        },
        "webp": web_meta,
        "outputs": {
            "final_png": str(out_dir / "04-final-1000.png"),
            "final_preview": str(out_dir / "04-final-1000.preview.png"),
            "webp": str(webp_path),
        },
    }
    report_path = out_dir / "report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"report -> {report_path}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Identity-locked storefront cutout regenerate -> 1000^2 WebP"
    )
    parser.add_argument("--input", required=True, help="Source product photo")
    parser.add_argument(
        "--out",
        default="tools/.wix-ai-pipeline/demo-storefront-regenerate",
        help="Output directory",
    )
    parser.add_argument(
        "--model",
        default="birefnet-general-lite",
        help="rembg matte model",
    )
    parser.add_argument(
        "--mode",
        choices=("solid", "cage"),
        default="solid",
        help="solid parts vs cage/mesh hole-preserving",
    )
    parser.add_argument(
        "--backend",
        choices=("gemini", "sd", "none"),
        default="gemini",
        help="Generative restore backend (default: gemini cloud image API)",
    )
    parser.add_argument(
        "--generative",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable generative restore (default on; --no-generative forces backend=none)",
    )
    parser.add_argument(
        "--strength",
        type=float,
        default=0.45,
        help="SD img2img strength only (ignored for gemini)",
    )
    args = parser.parse_args()
    input_path = Path(args.input)
    if not input_path.is_file():
        raise SystemExit(f"Input not found: {input_path}")
    out_dir = Path(args.out)
    if not out_dir.is_absolute():
        out_dir = PROJECT_ROOT / out_dir
    regenerate(
        input_path,
        out_dir,
        model=args.model,
        mode=args.mode,
        generative=args.generative,
        strength=args.strength,
        backend=args.backend,
    )


if __name__ == "__main__":
    main()
