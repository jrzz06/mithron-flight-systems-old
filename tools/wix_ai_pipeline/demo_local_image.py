#!/usr/bin/env python3
"""
Local demo: enhance → clean cutout → lit showcase from one uploaded image.

Usage:
  python tools/wix_ai_pipeline/demo_local_image.py --input path/to/image.png
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parent.parent
sys.path.insert(0, str(TOOLS_DIR.parent))

from wix_ai_pipeline.classify import classify_image
from wix_ai_pipeline.cutout import remove_background, validate_alpha
from wix_ai_pipeline.enhance import enhance_image
from wix_ai_pipeline.gpu_setup import preload_cuda_dlls
from wix_ai_pipeline.showcase import compose_showcase


def main() -> int:
    parser = argparse.ArgumentParser(description="Local dual-asset image pipeline demo")
    parser.add_argument("--input", required=True, help="Path to source image")
    parser.add_argument("--out", default="", help="Output directory (default: tools/.wix-ai-pipeline/demo-local)")
    parser.add_argument("--model", default="bria-rmbg", help="rembg model id")
    args = parser.parse_args()

    src = Path(args.input).expanduser().resolve()
    if not src.exists():
        raise SystemExit(f"Input not found: {src}")

    out_dir = Path(args.out).expanduser().resolve() if args.out else (TOOLS_DIR.parent / ".wix-ai-pipeline" / "demo-local")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "source").mkdir(exist_ok=True)

    print("GPU preload…")
    gpu = preload_cuda_dlls()
    print(json.dumps({k: gpu.get(k) for k in ("ort_version", "providers", "gpu_preferred", "cublas_found")}, indent=2))

    source_copy = out_dir / "source" / src.name
    if source_copy.resolve() != src.resolve():
        shutil.copy2(src, source_copy)
    else:
        source_copy = src

    image = Image.open(src)
    print(f"Loaded {src.name} size={image.size} mode={image.mode}")

    print("1/3 Enhance (same pose/size)...")
    enhanced = enhance_image(image)
    enhanced_path = out_dir / "01-enhanced.png"
    enhanced.save(enhanced_path, "PNG")
    print(f"  -> {enhanced_path}")

    clf = classify_image(enhanced)
    # Force a cutout path for demo photos (uploaded studio product shots)
    label = clf.label if clf.label in ("product_photo_white", "product_photo_complex", "drone_photo", "product_cutout_png") else "product_photo_white"
    print(f"2/3 Cutout (label={label}, model={args.model})...")
    cutout, method = remove_background(enhanced, label, model=args.model)
    ok, issues = validate_alpha(cutout)
    print(f"  method={method} alpha_ok={ok} issues={issues}")
    cutout = cutout.convert("RGBA")
    # Cleanup residual small islands
    from wix_ai_pipeline.cutout import remove_orphan_bg_blobs
    import numpy as np

    cut_arr = remove_orphan_bg_blobs(np.array(cutout))
    cutout = Image.fromarray(cut_arr, "RGBA")

    cutout_path = out_dir / "02-cutout.png"
    cutout_webp = out_dir / "02-cutout.webp"
    cutout.save(cutout_path, "PNG")
    cutout.save(cutout_webp, "WEBP", quality=95, method=6)
    # Checkerboard preview so transparency is visible
    preview = Image.new("RGBA", cutout.size, (0, 0, 0, 0))
    tile = 24
    chk = Image.new("RGB", cutout.size, (220, 220, 220))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(chk)
    for y in range(0, cutout.height, tile):
        for x in range(0, cutout.width, tile):
            if ((x // tile) + (y // tile)) % 2 == 0:
                draw.rectangle([x, y, x + tile, y + tile], fill=(245, 245, 245))
    preview = chk.convert("RGBA")
    preview.alpha_composite(cutout)
    cutout_preview = out_dir / "02-cutout.preview.png"
    preview.convert("RGB").save(cutout_preview, "PNG")
    print(f"  -> {cutout_path}")
    print(f"  -> {cutout_preview}")

    print("3/3 Showcase (lit studio background)...")
    showcase = compose_showcase(cutout, canvas_size=enhanced.size)
    showcase_path = out_dir / "03-showcase.png"
    showcase_webp = out_dir / "03-showcase.webp"
    showcase.save(showcase_path, "PNG")
    showcase.save(showcase_webp, "WEBP", quality=94, method=6)
    print(f"  -> {showcase_path}")

    report = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "input": str(src),
        "gpu": gpu,
        "classify": {"label": label, "raw": clf.label},
        "cutout_method": method,
        "alpha_ok": ok,
        "alpha_issues": issues,
        "outputs": {
            "enhanced": str(enhanced_path),
            "cutout": str(cutout_path),
            "cutout_preview": str(cutout_preview),
            "showcase": str(showcase_path),
        },
    }
    (out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("\nDONE")
    print(json.dumps(report["outputs"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
