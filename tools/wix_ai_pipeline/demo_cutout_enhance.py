"""
Single local demo: cage-aware cutout (transparent) → enhance (same WxH, no upscale).

Usage:
  python -u tools/wix_ai_pipeline/demo_cutout_enhance.py --input path/to/photo.png
  python -u tools/wix_ai_pipeline/demo_cutout_enhance.py --input photo.png --model birefnet-general-lite --mode cage
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
    remove_orphan_bg_blobs,
    validate_alpha,
)
from wix_ai_pipeline.enhance import enhance_image  # noqa: E402
from wix_ai_pipeline.export_web import save_png_master, save_webp_hq  # noqa: E402
from wix_ai_pipeline.gpu_setup import preload_cuda_dlls  # noqa: E402


def checkerboard_preview(cutout: Image.Image, tile: int = 24) -> Image.Image:
    chk = Image.new("RGB", cutout.size, (220, 220, 220))
    dark = (180, 180, 180)
    for y in range(0, cutout.height, tile):
        for x in range(0, cutout.width, tile):
            if ((x // tile) + (y // tile)) % 2 == 0:
                x2 = min(x + tile, cutout.width)
                y2 = min(y + tile, cutout.height)
                chk.paste(dark, (x, y, x2, y2))
    preview = chk.convert("RGBA")
    preview.alpha_composite(cutout.convert("RGBA"))
    return preview.convert("RGB")


def run(
    input_path: Path,
    out_dir: Path,
    model: str,
    mode: str,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "export").mkdir(parents=True, exist_ok=True)

    gpu = preload_cuda_dlls()
    print(json.dumps({k: gpu.get(k) for k in ("ort_version", "providers", "gpu_preferred", "cublas_found")}, indent=2))

    src = Image.open(input_path)
    src.load()
    print(f"0/2 Source {src.size} mode={src.mode} -> {input_path}")
    save_png_master(src.convert("RGBA"), out_dir / "00-source.png")

    print(f"1/2 Cutout (mode={mode}, model={model})...")
    if mode == "cage":
        cutout = cage_cutout(src, model=model)
        method = f"cage:{model}"
        # Do NOT remove orphan blobs — thin zip-ties / wires look like islands
    else:
        cutout = bria_cutout(src, model=model, preserve_holes=False, defringe="strong")
        method = f"solid:{model}"
        cutout = Image.fromarray(remove_orphan_bg_blobs(np.array(cutout.convert("RGBA"))), "RGBA")

    ok, issues = validate_alpha(cutout)
    print(f"  method={method} alpha_ok={ok} issues={issues} size={cutout.size}")
    cut_path = out_dir / "01-cutout.png"
    cut_preview = out_dir / "01-cutout.preview.png"
    save_png_master(cutout, cut_path)
    save_png_master(checkerboard_preview(cutout), cut_preview)
    save_webp_hq(cutout, out_dir / "export" / "cutout.webp", quality=92)
    print(f"  -> {cut_path}")
    print(f"  preview -> {cut_preview}")

    print("2/2 Enhance (same WxH, alpha locked, no final upscale)...")
    enhanced = enhance_image(cutout)
    if enhanced.size != cutout.size:
        enhanced = enhanced.resize(cutout.size, Image.Resampling.LANCZOS)
        enhanced.putalpha(cutout.getchannel("A"))
    enh_path = out_dir / "02-enhanced-cutout.png"
    enh_preview = out_dir / "02-enhanced-cutout.preview.png"
    save_png_master(enhanced, enh_path)
    save_png_master(checkerboard_preview(enhanced), enh_preview)
    save_webp_hq(enhanced, out_dir / "export" / "enhanced-cutout.webp", quality=92)
    print(f"  size={enhanced.size} -> {enh_path}")
    print(f"  preview -> {enh_preview}")

    report = {
        "input": str(input_path),
        "mode": mode,
        "model": model,
        "method": method,
        "alpha_ok": ok,
        "alpha_issues": issues,
        "source_size": list(src.size),
        "cutout_size": list(cutout.size),
        "enhanced_size": list(enhanced.size),
        "gpu": {k: gpu.get(k) for k in ("ort_version", "providers", "gpu_preferred", "cublas_found")},
        "outputs": {
            "source": str(out_dir / "00-source.png"),
            "cutout": str(cut_path),
            "cutout_preview": str(cut_preview),
            "enhanced": str(enh_path),
            "enhanced_preview": str(enh_preview),
        },
    }
    report_path = out_dir / "report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"report -> {report_path}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Demo: transparent cutout then enhance (no upscale)")
    parser.add_argument("--input", required=True, help="Source product photo")
    parser.add_argument(
        "--out",
        default="tools/.wix-ai-pipeline/demo-cage-cutout",
        help="Output directory",
    )
    parser.add_argument(
        "--model",
        default="birefnet-general-lite",
        help="rembg model (birefnet-general-lite recommended for cages)",
    )
    parser.add_argument(
        "--mode",
        choices=("cage", "solid"),
        default="cage",
        help="cage = hole-preserving; solid = default morph-close cleanup",
    )
    args = parser.parse_args()
    input_path = Path(args.input)
    if not input_path.is_file():
        raise SystemExit(f"Input not found: {input_path}")
    out_dir = Path(args.out)
    if not out_dir.is_absolute():
        out_dir = PROJECT_ROOT / out_dir
    run(input_path, out_dir, model=args.model, mode=args.mode)


if __name__ == "__main__":
    main()
