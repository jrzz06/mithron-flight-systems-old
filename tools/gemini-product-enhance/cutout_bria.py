#!/usr/bin/env python3
"""BRIA RMBG 2.0 cutout -> 1000x1000 transparent WebP (+ optional preview PNG).

Uses GPU (CUDA) by default after preloading NVIDIA DLLs.
Set CUTOUT_USE_GPU=0 to force CPU.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOOLS = ROOT.parent
sys.path.insert(0, str(TOOLS))

# Decide device before onnxruntime import side-effects
_USE_GPU = os.environ.get("CUTOUT_USE_GPU", "1").strip().lower() not in ("0", "false", "no", "cpu")
if _USE_GPU:
    # Undo parent-process CPU forcing if present
    os.environ.pop("ORT_CUDA_UNAVAILABLE", None)
    if os.environ.get("CUDA_VISIBLE_DEVICES", None) == "":
        os.environ.pop("CUDA_VISIBLE_DEVICES", None)
else:
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    os.environ["ORT_CUDA_UNAVAILABLE"] = "1"

os.environ.setdefault("ORT_TENSORRT_UNAVAILABLE", "1")

from PIL import Image  # noqa: E402
from rembg import new_session, remove  # noqa: E402

from wix_ai_pipeline.cutout import defringe_halo  # noqa: E402
from wix_ai_pipeline.gpu_setup import preload_cuda_dlls  # noqa: E402
from wix_ai_pipeline.square_canvas import fit_cutout_to_square  # noqa: E402


def make_session(model: str, force_cpu: bool = False):
    if _USE_GPU and not force_cpu:
        info = preload_cuda_dlls()
        print(
            f"[cutout_bria] GPU preload cublas={info.get('cublas_found')} "
            f"providers={info.get('providers')}",
            flush=True,
        )
        try:
            return new_session(model, providers=["CUDAExecutionProvider", "CPUExecutionProvider"]), "cuda"
        except Exception as exc:  # noqa: BLE001
            print(f"[cutout_bria] CUDA session failed ({exc}); falling back to CPU", flush=True)
    return new_session(model, providers=["CPUExecutionProvider"]), "cpu"


def run_remove(raw: Image.Image, model: str):
    """Try GPU inference; on CUBLAS/ORT failure retry once on CPU."""
    session, device = make_session(model, force_cpu=False)
    try:
        cut = remove(raw.convert("RGB"), session=session)
        return cut, device
    except Exception as exc:  # noqa: BLE001
        if device == "cpu":
            raise
        print(f"[cutout_bria] GPU infer failed ({exc}); retrying on CPU", flush=True)
        session, device = make_session(model, force_cpu=True)
        cut = remove(raw.convert("RGB"), session=session)
        return cut, device


def main() -> int:
    ap = argparse.ArgumentParser(description="BRIA RMBG 2.0 cutout + square WebP")
    ap.add_argument("--input", required=True, help="Gemini-enhanced (or source) image")
    ap.add_argument("--out-webp", required=True, help="Output 1000x1000 WebP path")
    ap.add_argument("--out-preview", default="", help="Optional PNG preview")
    ap.add_argument("--side", type=int, default=1000)
    ap.add_argument("--margin", type=float, default=0.08)
    ap.add_argument("--quality", type=int, default=85)
    ap.add_argument("--model", default="bria-rmbg", help="rembg model (bria-rmbg = RMBG 2.0)")
    args = ap.parse_args()

    src = Path(args.input)
    if not src.is_file():
        print(f"ERROR: input not found: {src}", file=sys.stderr)
        return 1

    out_webp = Path(args.out_webp)
    out_webp.parent.mkdir(parents=True, exist_ok=True)

    print(f"[cutout_bria] model={args.model} want_gpu={_USE_GPU} input={src}", flush=True)
    t0 = time.time()
    raw = Image.open(src).convert("RGBA")
    cut, device = run_remove(raw, args.model)
    if not isinstance(cut, Image.Image):
        cut = Image.open(cut)
    cut = cut.convert("RGBA")
    if cut.size != raw.size:
        cut = cut.resize(raw.size, Image.Resampling.LANCZOS)
    cut = defringe_halo(cut, strength="strong")

    square = fit_cutout_to_square(cut, side=args.side, margin_ratio=args.margin)
    square.save(
        out_webp,
        format="WEBP",
        quality=args.quality,
        method=6,
        lossless=False,
        exact=True,
    )
    size_kb = out_webp.stat().st_size / 1024
    print(
        f"[cutout_bria] wrote {out_webp} ({square.size[0]}x{square.size[1]}, "
        f"{size_kb:.1f} KB, device={device}, {time.time() - t0:.1f}s)",
        flush=True,
    )

    if args.out_preview:
        prev = Path(args.out_preview)
        prev.parent.mkdir(parents=True, exist_ok=True)
        square.save(prev, format="PNG", optimize=True)
        print(f"[cutout_bria] preview {prev}", flush=True)

    meta = {
        "model": args.model,
        "device": device,
        "side": args.side,
        "margin": args.margin,
        "quality": args.quality,
        "bytes": out_webp.stat().st_size,
        "width": square.size[0],
        "height": square.size[1],
        "seconds": round(time.time() - t0, 2),
    }
    meta_path = out_webp.with_suffix(out_webp.suffix + ".cutout.json")
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
