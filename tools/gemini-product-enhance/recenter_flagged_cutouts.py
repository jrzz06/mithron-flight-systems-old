#!/usr/bin/env python3
"""
Re-center flagged IMAGE BUCKET cutouts without re-running BiRefNet.

Reads centering-validation-report.json (or re-scans), crops each flagged WebP
to its visible alpha bbox, then places it on a fresh 1000×1000 transparent
canvas with equal L/R and T/B padding.

Usage:
  python recenter_flagged_cutouts.py
  python recenter_flagged_cutouts.py --report centering-validation-report.json
  python recenter_flagged_cutouts.py --all   # re-center every webp in the bucket
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
TOOLS = ROOT.parent
sys.path.insert(0, str(TOOLS))

from wix_ai_pipeline.square_canvas import (  # noqa: E402
    DEFAULT_ALPHA_THRESHOLD,
    fit_cutout_to_square,
    measure_content_center,
)

DEFAULT_BUCKET = Path(r"D:\mithuuu\IMAGE BUCKET")
REPORT_JSON = ROOT / "centering-validation-report.json"
STOREFRONT_SIDE = 1000
WEBP_TARGET_MAX = 140 * 1024
MARGIN_RATIO = 0.08


def save_webp(image: Image.Image, path: Path) -> int:
    if image.size != (STOREFRONT_SIDE, STOREFRONT_SIDE):
        raise ValueError(f"Expected {STOREFRONT_SIDE}x{STOREFRONT_SIDE}, got {image.size}")
    path.parent.mkdir(parents=True, exist_ok=True)

    def probe(q: int) -> int:
        buf = io.BytesIO()
        image.save(buf, "WEBP", quality=q, method=0, lossless=False)
        return buf.tell()

    ladder = (94, 90, 86, 82, 78, 74, 70, 65, 60, 55, 50)
    best_q = 50
    for q in ladder:
        if probe(q) <= WEBP_TARGET_MAX:
            best_q = q
            break
    image.save(path, "WEBP", quality=best_q, method=4, lossless=False)
    size = path.stat().st_size
    while size > WEBP_TARGET_MAX and best_q > 50:
        best_q = max(50, best_q - 4)
        image.save(path, "WEBP", quality=best_q, method=4, lossless=False)
        size = path.stat().st_size
    return size


def recenter_one(path: Path, *, alpha_threshold: int, tolerance: float) -> dict:
    before_im = Image.open(path).convert("RGBA")
    before = measure_content_center(before_im, alpha_threshold=alpha_threshold)
    square = fit_cutout_to_square(
        before_im,
        side=STOREFRONT_SIDE,
        margin_ratio=MARGIN_RATIO,
        alpha_threshold=alpha_threshold,
    )
    bytes_out = save_webp(square, path)
    after = measure_content_center(square, alpha_threshold=alpha_threshold)
    # Prefer opaque-mass offsets (visual weight); bbox tips can stay unequal on L-shapes.
    if after is None:
        ok = False
    else:
        mx = after.get("mass_x_off")
        my = after.get("mass_y_off")
        if mx is not None or my is not None:
            ok = abs(float(mx or 0)) <= tolerance and abs(float(my or 0)) <= tolerance
        else:
            ok = abs(after["cx_off"]) <= tolerance and abs(after["cy_off"]) <= tolerance
    return {
        "path": str(path),
        "bytes": bytes_out,
        "before": before,
        "after": after,
        "ok": ok,
    }


def load_targets(args: argparse.Namespace) -> list[Path]:
    if args.all:
        return sorted(args.bucket.rglob("*.webp"))
    if args.report and args.report.is_file():
        data = json.loads(args.report.read_text(encoding="utf-8"))
        paths = []
        for row in data.get("flagged") or []:
            p = Path(row["path"])
            if p.is_file():
                paths.append(p)
        return paths
    # Fall back: scan now
    from validate_cutout_centering import REPORT_JSON as _  # noqa: F401
    import validate_cutout_centering as val

    # Inline scan
    paths = []
    for path in sorted(args.bucket.rglob("*.webp")):
        m = measure_content_center(Image.open(path), alpha_threshold=args.alpha_threshold)
        if not m:
            paths.append(path)
            continue
        if abs(m["cx_off"]) > args.tolerance or abs(m["cy_off"]) > args.tolerance:
            paths.append(path)
    return paths


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bucket", type=Path, default=DEFAULT_BUCKET)
    ap.add_argument("--report", type=Path, default=REPORT_JSON)
    ap.add_argument("--tolerance", type=float, default=5.0)
    ap.add_argument("--alpha-threshold", type=int, default=DEFAULT_ALPHA_THRESHOLD)
    ap.add_argument("--all", action="store_true", help="Re-center every webp in the bucket")
    args = ap.parse_args()

    targets = load_targets(args)
    if not targets:
        print("No flagged images to recenter.", flush=True)
        return 0

    print(f"Re-centering {len(targets)} cutout(s)…", flush=True)
    ok = fail = 0
    results = []
    for i, path in enumerate(targets, 1):
        try:
            meta = recenter_one(
                path,
                alpha_threshold=args.alpha_threshold,
                tolerance=args.tolerance,
            )
            b = meta["before"] or {}
            a = meta["after"] or {}
            print(
                f"[{i}/{len(targets)}] {path.parent.name}/{path.name}: "
                f"before cx/cy={b.get('cx_off', float('nan')):+.1f}/{b.get('cy_off', float('nan')):+.1f} → "
                f"after cx/cy={a.get('cx_off', float('nan')):+.1f}/{a.get('cy_off', float('nan')):+.1f} "
                f"{'OK' if meta['ok'] else 'STILL_OFF'} ({meta['bytes']/1024:.1f} KB)",
                flush=True,
            )
            results.append(meta)
            if meta["ok"]:
                ok += 1
            else:
                fail += 1
        except Exception as exc:  # noqa: BLE001
            print(f"[{i}/{len(targets)}] FAIL {path}: {exc}", flush=True)
            fail += 1

    summary = ROOT / "centering-recenter-summary.json"
    summary.write_text(
        json.dumps({"ok": ok, "fail": fail, "results": results}, indent=2, default=str),
        encoding="utf-8",
    )
    print(f"\nDone. ok={ok} fail={fail}", flush=True)
    print(f"wrote {summary}", flush=True)
    return 0 if fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
