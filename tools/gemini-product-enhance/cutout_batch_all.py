#!/usr/bin/env python3
"""
Batch cutout for all Gemini-enhanced product images.

Pipeline per image:
  BiRefNet General (PyTorch CUDA only) → Soft Defringe → Edge Decontam → 1000×1000 WebP ≤140 KB

Output (WebP only):
  D:/mithuuu/IMAGE BUCKET/{Product Name}/{NN}.webp

Usage:
  python cutout_batch_all.py
  python cutout_batch_all.py --limit=5
  python cutout_batch_all.py --only=drone-soccer-200 --no-skip
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
TOOLS = ROOT.parent
sys.path.insert(0, str(TOOLS))

from wix_ai_pipeline.cutout import defringe_halo, erode_alpha, remove_orphan_bg_blobs  # noqa: E402
from wix_ai_pipeline.square_canvas import fit_cutout_to_square  # noqa: E402

STAGING = ROOT / "staging"
MANIFEST = ROOT / "manifest.json"
NAMES_FILE = ROOT / "product-names.json"
IMAGE_BUCKET = Path(r"D:\mithuuu\IMAGE BUCKET")
RUN_LOG = ROOT / "cutout-batch-log.jsonl"
TORCH_MODEL_ID = "ZhengPeng7/BiRefNet"  # BiRefNet General
WEBP_TARGET_MIN = 120 * 1024
WEBP_TARGET_MAX = 140 * 1024
STOREFRONT_SIDE = 1000

HARD_KEYWORDS = (
    "soccer",
    "cage",
    "mesh",
    "guard",
    "propeller-guard",
    "propeller guard",
    "propeller",
    "fan",
    "feather",
)


def log(msg: str) -> None:
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode("ascii"), flush=True)


def append_log(entry: dict) -> None:
    with RUN_LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps({**entry, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}) + "\n")


def sanitize_folder_name(name: str) -> str:
    s = str(name or "").strip()
    s = s.replace("/", "-").replace("\\", "-").replace(":", "-")
    s = re.sub(r'[<>"|?*]', "", s)
    s = re.sub(r"\s+", " ", s).strip(" .")
    return s or "unknown-product"


def load_name_map() -> dict[str, str]:
    if NAMES_FILE.is_file():
        return json.loads(NAMES_FILE.read_text(encoding="utf-8"))
    return {}


def humanize_slug(slug: str) -> str:
    s = re.sub(r"^source-", "", slug)
    s = s.replace("-", " ").strip()
    return s.title() if s else slug


def is_hard_product(slug: str, name: str) -> bool:
    """Cage/mesh/fan/feather/soccer — preserve holes, lighter defringe."""
    blob = f"{slug} {name}".lower()
    return any(k in blob for k in HARD_KEYWORDS)


class TorchBiRefNet:
    """BiRefNet General on PyTorch CUDA only (rembg ORT CUDA/cuBLAS is broken here)."""

    def __init__(self, model_id: str = TORCH_MODEL_ID):
        import torch
        from transformers import AutoModelForImageSegmentation
        from torchvision import transforms

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA required: torch.cuda.is_available() is False")

        self.torch = torch
        self.device = "cuda"
        log(f"Loading Torch BiRefNet {model_id} on cuda...")
        t0 = time.perf_counter()
        self.model = AutoModelForImageSegmentation.from_pretrained(
            model_id, trust_remote_code=True
        )
        self.model.to(self.device)
        self.model.eval()
        torch.backends.cudnn.benchmark = True
        param_dev = next(self.model.parameters()).device
        log(f"Model parameters device: {param_dev}")
        if param_dev.type != "cuda":
            raise RuntimeError(f"Model not on CUDA: {param_dev}")
        self.transform = transforms.Compose(
            [
                transforms.Resize((1024, 1024)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )
        self.load_seconds = time.perf_counter() - t0
        log(f"Torch BiRefNet ready in {self.load_seconds:.1f}s (cuda)")

    def cutout(self, image: Image.Image) -> tuple[Image.Image, float]:
        """Returns (RGBA cutout, inference_seconds)."""
        from torchvision.transforms import functional as TF

        torch = self.torch
        rgb = image.convert("RGB")
        w, h = rgb.size
        inp = self.transform(rgb).unsqueeze(0).to(self.device, non_blocking=True)

        torch.cuda.synchronize()
        t0 = time.perf_counter()
        with torch.inference_mode():
            with torch.amp.autocast("cuda", dtype=torch.float16):
                preds = self.model(inp)[-1].sigmoid()
            preds = preds.float().cpu()
        torch.cuda.synchronize()
        infer_s = time.perf_counter() - t0

        mask = preds[0].squeeze()
        mask = TF.resize(mask.unsqueeze(0), (h, w), antialias=True).squeeze(0)
        alpha = (mask.numpy() * 255).clip(0, 255).astype(np.uint8)
        rgba = np.array(rgb.convert("RGBA"))
        rgba[:, :, 3] = alpha
        return Image.fromarray(rgba, "RGBA"), infer_s


def edge_decontaminate(img: Image.Image) -> Image.Image:
    arr = np.array(img.convert("RGBA"), dtype=np.float32)
    rgb = arr[:, :, :3]
    a = arr[:, :, 3]
    alpha = np.maximum(a / 255.0, 1e-4)
    luma = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    edge = (a > 0) & (a < 250)
    bg = np.array([255.0, 255.0, 255.0], dtype=np.float32)
    fg = np.clip((rgb - (1.0 - alpha[..., None]) * bg) / alpha[..., None], 0, 255)
    contaminated = edge & (((luma > 190) & (sat < 60)) | ((a < 180) & (luma > 160)))
    out_rgb = np.where(contaminated[..., None], fg, rgb)
    opaque = (a > 220).astype(np.float32)
    for c in range(3):
        blur = cv2.blur(out_rgb[:, :, c] * opaque, (5, 5))
        wsum = cv2.blur(opaque, (5, 5))
        neighbor = np.divide(blur, np.maximum(wsum, 1e-3))
        mix = edge & (a < 230)
        out_rgb[:, :, c] = np.where(mix, neighbor * 0.55 + out_rgb[:, :, c] * 0.45, out_rgb[:, :, c])
    luma2 = 0.2126 * out_rgb[:, :, 0] + 0.7152 * out_rgb[:, :, 1] + 0.0722 * out_rgb[:, :, 2]
    sat2 = out_rgb.max(axis=2) - out_rgb.min(axis=2)
    out_a = a.copy()
    kill = (a > 0) & (a < 160) & (luma2 > 220) & (sat2 < 30)
    out_a[kill] = 0
    fringe2 = (out_a > 0) & (out_a < 230) & (luma2 > 200) & (sat2 < 40)
    if np.any(fringe2):
        eroded = erode_alpha(out_a.astype(np.uint8), radius=1).astype(np.float32)
        out_a = np.where(fringe2, np.minimum(out_a, eroded), out_a)
    out_rgb = np.where(out_a[..., None] < 1, 0, out_rgb)
    return Image.fromarray(np.dstack([out_rgb, out_a]).astype(np.uint8), "RGBA")


def save_webp_fast(
    image: Image.Image,
    path: Path,
    *,
    target_min: int = WEBP_TARGET_MIN,
    target_max: int = WEBP_TARGET_MAX,
) -> dict:
    """
    Fast WebP ≤140 KB: few method=0 probes, then method=4 disk writes only as needed.
    Prefer landing in 120–140 KB.
    """
    if image.size != (STOREFRONT_SIDE, STOREFRONT_SIDE):
        raise ValueError(f"Expected {STOREFRONT_SIDE}x{STOREFRONT_SIDE}, got {image.size}")
    path.parent.mkdir(parents=True, exist_ok=True)

    def probe(q: int) -> int:
        buf = io.BytesIO()
        image.save(buf, "WEBP", quality=q, method=0, lossless=False)
        return buf.tell()

    def write(q: int) -> int:
        image.save(path, "WEBP", quality=q, method=4, lossless=False)
        return path.stat().st_size

    # Highest probe quality that looks under max (method=0 ≈ upper bound vs method=4)
    ladder = (94, 90, 86, 82, 78, 74, 70, 65, 60, 55, 50)
    best_q = 50
    for q in ladder:
        if probe(q) <= target_max:
            best_q = q
            break

    size = write(best_q)
    # Step down if final overshot
    while size > target_max and best_q > 50:
        best_q = max(50, best_q - 4)
        size = write(best_q)
    # Step up into 120–140 KB band when undersized
    while size < target_min and best_q < 94:
        nxt = min(94, best_q + 4)
        nsize = write(nxt)
        if nsize > target_max:
            size = write(best_q)  # revert
            break
        best_q = nxt
        size = nsize

    return {
        "path": str(path),
        "width": STOREFRONT_SIDE,
        "height": STOREFRONT_SIDE,
        "quality": best_q,
        "file_size_bytes": size,
        "in_budget": size <= target_max,
        "target_min_bytes": target_min,
        "target_max_bytes": target_max,
    }


def process_one(engine: TorchBiRefNet, src: Path, out_webp: Path, *, preserve_holes: bool) -> dict:
    t_total = time.perf_counter()

    t0 = time.perf_counter()
    raw = Image.open(src).convert("RGBA")
    load_s = time.perf_counter() - t0

    cut, infer_s = engine.cutout(raw)

    t0 = time.perf_counter()
    if not preserve_holes:
        arr = np.array(cut)
        alpha = arr[:, :, 3]
        kernel = np.ones((3, 3), np.uint8)
        arr[:, :, 3] = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=1)
        cut = Image.fromarray(arr, "RGBA")
        soft = defringe_halo(cut, strength="soft")
        soft = defringe_halo(soft, strength="soft")
    else:
        # Hard products: one soft defringe only (avoid eating thin mesh)
        soft = defringe_halo(cut, strength="soft")
    clean = edge_decontaminate(soft)
    # Drop fringe islands before square fit so alpha-bbox centering is visual, not canvas padding.
    clean = Image.fromarray(remove_orphan_bg_blobs(np.array(clean.convert("RGBA"))), "RGBA")
    post_s = time.perf_counter() - t0

    t0 = time.perf_counter()
    # Crop to visible product (alpha>=32), then equal L/R + T/B pad on 1000×1000.
    square = fit_cutout_to_square(clean, side=STOREFRONT_SIDE, margin_ratio=0.08)
    square_s = time.perf_counter() - t0

    t0 = time.perf_counter()
    meta = save_webp_fast(square, out_webp)
    save_s = time.perf_counter() - t0

    total_s = time.perf_counter() - t_total
    meta["device"] = "cuda:0"
    meta["timing"] = {
        "load": round(load_s, 3),
        "infer": round(infer_s, 3),
        "post": round(post_s, 3),
        "square": round(square_s, 3),
        "save": round(save_s, 3),
        "total": round(total_s, 3),
    }
    return meta


def discover_jobs(name_map: dict[str, str], only: str = "", limit: int = 0) -> list[dict]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    jobs = []
    for j in manifest.get("jobs", []):
        slug = j["slug"]
        suffix = j.get("suffix") or str(j.get("index", 1)).zfill(2)
        if only and only.lower() not in slug.lower() and only.lower() not in j.get("id", "").lower():
            continue
        gemini = STAGING / slug / f"{slug}-{suffix}.gemini-raw.png"
        if not gemini.is_file():
            gemini = ROOT / "downloads" / f"{slug}-{suffix}-gemini.png"
        if not gemini.is_file():
            continue
        name = name_map.get(slug) or humanize_slug(slug)
        folder = sanitize_folder_name(name)
        out = IMAGE_BUCKET / folder / f"{suffix}.webp"
        jobs.append(
            {
                "id": j["id"],
                "slug": slug,
                "suffix": suffix,
                "name": name,
                "folder": folder,
                "src": str(gemini),
                "out": str(out),
                "preserve_holes": is_hard_product(slug, name),
            }
        )
        if limit > 0 and len(jobs) >= limit:
            break
    return jobs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", default="")
    ap.add_argument("--no-skip", action="store_true")
    args = ap.parse_args()

    import torch

    if not torch.cuda.is_available():
        log("ERROR: CUDA is required. GPU-only mode; refusing CPU fallback.")
        return 1

    name_map = load_name_map()
    jobs = discover_jobs(name_map, only=args.only, limit=args.limit)
    if not jobs:
        log("No jobs found (need staging/*/…gemini-raw.png + manifest)")
        return 1

    IMAGE_BUCKET.mkdir(parents=True, exist_ok=True)
    log(f"=== cutout batch: {len(jobs)} jobs  model=torch/{TORCH_MODEL_ID} device=cuda ===")
    append_log({"event": "batch_start", "count": len(jobs), "model": TORCH_MODEL_ID, "device": "cuda"})

    engine = TorchBiRefNet()
    log(f"GPU: {torch.cuda.get_device_name(0)}")
    log(f"Model load: {engine.load_seconds:.1f}s")

    ok = fail = skip = 0
    for i, job in enumerate(jobs, 1):
        out = Path(job["out"])
        log(f"\n[{i}/{len(jobs)}] {job['id']} -> {job['folder']}/{out.name}")
        if out.is_file() and not args.no_skip and out.stat().st_size >= 10 * 1024:
            log(f"  SKIP existing ({out.stat().st_size / 1024:.1f} KB)")
            append_log({"event": "skip", "id": job["id"], "out": str(out)})
            skip += 1
            continue
        if out.is_file() and out.stat().st_size < 10 * 1024:
            try:
                out.unlink()
            except OSError:
                pass
        out.parent.mkdir(parents=True, exist_ok=True)
        for p in out.parent.iterdir():
            if p.is_file() and p.suffix.lower() != ".webp":
                try:
                    p.unlink()
                except OSError:
                    pass
        try:
            meta = process_one(engine, Path(job["src"]), out, preserve_holes=job["preserve_holes"])
            kb = meta["file_size_bytes"] / 1024
            tm = meta["timing"]
            log(
                f"  OK {kb:.1f} KB q={meta['quality']} device={meta['device']} "
                f"total={tm['total']:.1f}s "
                f"(load={tm['load']:.2f} infer={tm['infer']:.2f} "
                f"post={tm['post']:.2f} square={tm['square']:.2f} save={tm['save']:.2f})"
            )
            append_log(
                {
                    "event": "ok",
                    "id": job["id"],
                    "out": str(out),
                    "bytes": meta["file_size_bytes"],
                    "quality": meta["quality"],
                    "device": meta["device"],
                    "preserve_holes": job["preserve_holes"],
                    "timing": meta["timing"],
                }
            )
            ok += 1
        except Exception as exc:  # noqa: BLE001
            log(f"  FAIL {exc}")
            append_log({"event": "fail", "id": job["id"], "error": str(exc)})
            fail += 1

    append_log({"event": "batch_end", "ok": ok, "fail": fail, "skip": skip})
    log(f"\nDone. ok={ok} fail={fail} skip={skip}")
    log(f"Output root: {IMAGE_BUCKET}")
    return 0 if fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
