#!/usr/bin/env python3
"""
Dual-asset product image pipeline (1000×1000 HQ default).

  enhance → square cutout (A) → StableDiffusionInpaintPipeline hero (B)
  → PNG masters + high-quality WebP exports

Usage:
  python tools/wix_ai_pipeline/run_dual_assets.py --input path/to.png --hero-mode=generative
  python tools/wix_ai_pipeline/run_dual_assets.py --slug source-10-liter-dual-agri-drone --hero-mode=studio
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parent.parent
sys.path.insert(0, str(TOOLS_DIR.parent))

from wix_ai_pipeline.classify import classify_image
from wix_ai_pipeline.cutout import remove_background, remove_orphan_bg_blobs, validate_alpha
from wix_ai_pipeline.enhance import enhance_to_square
from wix_ai_pipeline.export_web import save_png_master, save_webp_hq, save_webp_storefront
from wix_ai_pipeline.gpu_setup import preload_cuda_dlls
from wix_ai_pipeline.hero_generative import compose_marketing_hero, probe_generative_capability
from wix_ai_pipeline.square_canvas import fit_cutout_to_square
from wix_ai_pipeline.supabase_media import download_image, fetch_product_primary, resolve_primary_image_url

DEFAULT_SIDE = 1000


def checkerboard_preview(cutout: Image.Image, tile: int = 24) -> Image.Image:
    chk = Image.new("RGB", cutout.size, (220, 220, 220))
    draw = ImageDraw.Draw(chk)
    for y in range(0, cutout.height, tile):
        for x in range(0, cutout.width, tile):
            if ((x // tile) + (y // tile)) % 2 == 0:
                draw.rectangle([x, y, x + tile, y + tile], fill=(245, 245, 245))
    preview = chk.convert("RGBA")
    preview.alpha_composite(cutout.convert("RGBA"))
    return preview.convert("RGB")


def process_image(
    image: Image.Image,
    out_dir: Path,
    *,
    rembg_model: str = "bria-rmbg",
    hero_mode: str = "generative",
    side: int = DEFAULT_SIDE,
    source_meta: dict | None = None,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "source").mkdir(exist_ok=True)
    (out_dir / "export").mkdir(exist_ok=True)

    gpu = preload_cuda_dlls()
    print(json.dumps({k: gpu.get(k) for k in ("ort_version", "providers", "gpu_preferred", "cublas_found")}, indent=2))

    print(f"1/4 Enhance -> {side}x{side} HQ (Real-ESRGAN + clarity)...")
    enhanced_sq = enhance_to_square(image, side=side)
    enhanced_path = out_dir / "01-enhanced.png"
    enhanced_webp = out_dir / "export" / "enhanced.webp"
    save_png_master(enhanced_sq, enhanced_path)
    save_webp_hq(enhanced_sq, enhanced_webp, quality=92)
    print(f"  size={enhanced_sq.size} -> {enhanced_path}")
    print(f"  web -> {enhanced_webp}")

    clf = classify_image(enhanced_sq)
    label = (
        clf.label
        if clf.label in ("product_photo_white", "product_photo_complex", "drone_photo", "product_cutout_png")
        else "product_photo_white"
    )
    print(f"2/4 Cutout (label={label}, model={rembg_model})...")
    cutout, method = remove_background(enhanced_sq, label, model=rembg_model)
    cutout = Image.fromarray(remove_orphan_bg_blobs(np.array(cutout.convert("RGBA"))), "RGBA")
    cutout = fit_cutout_to_square(cutout, side=side, margin_ratio=0.08)
    ok, issues = validate_alpha(cutout)
    print(f"  method={method} alpha_ok={ok} issues={issues} size={cutout.size}")

    if cutout.size != (side, side):
        cutout = fit_cutout_to_square(cutout, side=side, margin_ratio=0.08)

    cutout_png = out_dir / "02-cutout.png"
    cutout_webp = out_dir / "export" / "cutout.webp"
    cutout_preview = out_dir / "02-cutout.preview.png"
    save_png_master(cutout, cutout_png)
    cutout_web_meta = save_webp_storefront(cutout, cutout_webp)
    save_png_master(checkerboard_preview(cutout), cutout_preview)
    print(f"  -> {cutout_png}")
    print(
        f"  web -> {cutout_webp} "
        f"q={cutout_web_meta['quality']} bytes={cutout_web_meta['file_size_bytes']} "
        f"over_budget={cutout_web_meta['over_budget']}"
    )

    print(f"3/4 Marketing hero via StableDiffusionInpaintPipeline (mode={hero_mode})...")
    generative_capability = None
    if hero_mode == "generative":
        capability = probe_generative_capability()
        generative_capability = {
            "available": capability.available,
            "reason": capability.reason,
            "torch_version": capability.torch_version,
            "cuda": capability.cuda,
        }
        print(f"  generative_probe available={capability.available} reason={capability.reason}")
        if not capability.available:
            print("  CUDA/torch generative unavailable - continuing with studio-composite fallback")
    hero = compose_marketing_hero(cutout, canvas_size=(side, side), mode=hero_mode)  # type: ignore[arg-type]
    hero_img = hero.image
    if hero_img.size != (side, side):
        hero_img = hero_img.resize((side, side), Image.Resampling.LANCZOS)
    hero_png = out_dir / "03-hero.png"
    hero_webp = out_dir / "export" / "hero.webp"
    save_png_master(hero_img, hero_png)
    hero_web_meta = save_webp_storefront(hero_img.convert("RGB"), hero_webp)
    print(f"  mode_used={hero.mode_used} size={hero_img.size} notes={hero.notes}")
    print(f"  -> {hero_png}")
    print(
        f"  web -> {hero_webp} "
        f"q={hero_web_meta['quality']} bytes={hero_web_meta['file_size_bytes']} "
        f"over_budget={hero_web_meta['over_budget']}"
    )

    report = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "side": side,
        "source": source_meta or {},
        "gpu": {k: gpu.get(k) for k in ("ort_version", "providers", "gpu_preferred", "cublas_found")},
        "classify": {"label": label, "raw": clf.label},
        "cutout_method": method,
        "alpha_ok": ok,
        "alpha_issues": issues,
        "hero_mode_requested": hero_mode,
        "hero_mode_used": hero.mode_used,
        "hero_notes": hero.notes,
        "generative_capability": generative_capability,
        "cutout_webp_meta": cutout_web_meta,
        "hero_webp_meta": hero_web_meta,
        "outputs": {
            "enhanced": str(enhanced_path),
            "enhanced_webp": str(enhanced_webp),
            "cutout": str(cutout_png),
            "cutout_webp": str(cutout_webp),
            "cutout_preview": str(cutout_preview),
            "hero": str(hero_png),
            "hero_webp": str(hero_webp),
        },
        "verdict": "WIN" if ok else "PARTIAL",
    }
    (out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("4/4 Report written")
    print(json.dumps(report["outputs"], indent=2))
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Dual-asset AI product image pipeline")
    parser.add_argument("--input", default="", help="Local source image path")
    parser.add_argument("--slug", default="", help="Fetch primary image from Supabase by slug")
    parser.add_argument("--out", default="", help="Output directory")
    parser.add_argument("--model", default="bria-rmbg", help="rembg model")
    parser.add_argument("--hero-mode", default="generative", choices=["generative", "studio"])
    parser.add_argument("--side", type=int, default=DEFAULT_SIDE, help="Output square side (default 1000)")
    args = parser.parse_args()

    if not args.input and not args.slug:
        raise SystemExit("Provide --input or --slug")

    out_dir = (
        Path(args.out).expanduser().resolve()
        if args.out
        else (TOOLS_DIR.parent / ".wix-ai-pipeline" / (args.slug or "demo-local"))
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    source_meta: dict = {}
    if args.slug:
        product = fetch_product_primary(PROJECT_ROOT, args.slug)
        url = resolve_primary_image_url(product)
        if not url:
            raise SystemExit(f"No primary image URL for {args.slug}")
        dest = out_dir / "source" / "supabase-primary.png"
        download_image(url, dest)
        src_path = dest
        source_meta = {"slug": args.slug, "url": url, "name": product.get("name")}
        print(f"Retrieved {url}")
    else:
        src_path = Path(args.input).expanduser().resolve()
        if not src_path.exists():
            raise SystemExit(f"Input not found: {src_path}")
        (out_dir / "source").mkdir(parents=True, exist_ok=True)
        staged = out_dir / "source" / src_path.name
        if staged.resolve() != src_path.resolve():
            shutil.copy2(src_path, staged)
        source_meta = {"input": str(src_path)}

    image = Image.open(src_path)
    print(f"Loaded size={image.size} mode={image.mode}")
    process_image(
        image,
        out_dir,
        rembg_model=args.model,
        hero_mode=args.hero_mode,
        side=max(256, args.side),
        source_meta=source_meta,
    )
    print("\nDONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
