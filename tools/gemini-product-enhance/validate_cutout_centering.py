#!/usr/bin/env python3
"""
Validate IMAGE BUCKET cutouts are alpha-bbox centered on their 1000×1000 canvas.

Uses the same content_bbox logic as fit_cutout_to_square (opaque product, not
soft fringe). Flags any image whose content center is more than ±tolerance px
from the canvas center on either axis.

Usage:
  python validate_cutout_centering.py
  python validate_cutout_centering.py --tolerance=5
  python validate_cutout_centering.py --bucket "D:/mithuuu/IMAGE BUCKET"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
TOOLS = ROOT.parent
sys.path.insert(0, str(TOOLS))

from wix_ai_pipeline.square_canvas import (  # noqa: E402
    DEFAULT_ALPHA_THRESHOLD,
    measure_content_center,
)

DEFAULT_BUCKET = Path(r"D:\mithuuu\IMAGE BUCKET")
REPORT_JSON = ROOT / "centering-validation-report.json"
REPORT_MD = ROOT / "centering-validation-report.md"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bucket", type=Path, default=DEFAULT_BUCKET)
    ap.add_argument("--tolerance", type=float, default=5.0)
    ap.add_argument("--alpha-threshold", type=int, default=DEFAULT_ALPHA_THRESHOLD)
    ap.add_argument("--json-out", type=Path, default=REPORT_JSON)
    ap.add_argument("--md-out", type=Path, default=REPORT_MD)
    args = ap.parse_args()

    bucket: Path = args.bucket
    if not bucket.is_dir():
        print(f"ERROR: bucket not found: {bucket}", flush=True)
        return 1

    rows: list[dict] = []
    for path in sorted(bucket.rglob("*.webp")):
        try:
            im = Image.open(path)
            m = measure_content_center(im, alpha_threshold=args.alpha_threshold)
        except Exception as exc:  # noqa: BLE001
            rows.append(
                {
                    "path": str(path),
                    "rel": str(path.relative_to(bucket)),
                    "error": str(exc),
                    "flagged": True,
                    "flag_reason": ["read_error"],
                }
            )
            continue
        if not m:
            rows.append(
                {
                    "path": str(path),
                    "rel": str(path.relative_to(bucket)),
                    "flagged": True,
                    "flag_reason": ["empty_content"],
                }
            )
            continue
        cx_off = float(m["cx_off"])
        cy_off = float(m["cy_off"])
        mass_x = m.get("mass_x_off")
        mass_y = m.get("mass_y_off")
        reasons = []
        # Visual weight (opaque mass) is the storefront-facing center check.
        if mass_x is not None and abs(float(mass_x)) > args.tolerance:
            reasons.append(f"mass_x_off={float(mass_x):+.1f}")
        if mass_y is not None and abs(float(mass_y)) > args.tolerance:
            reasons.append(f"mass_y_off={float(mass_y):+.1f}")
        # Fall back to bbox only when mass is unavailable.
        if mass_x is None and mass_y is None:
            if abs(cx_off) > args.tolerance:
                reasons.append(f"cx_off={cx_off:+.1f}")
            if abs(cy_off) > args.tolerance:
                reasons.append(f"cy_off={cy_off:+.1f}")
        rows.append(
            {
                "path": str(path),
                "rel": str(path.relative_to(bucket)).replace("\\", "/"),
                "folder": path.parent.name,
                "file": path.name,
                "size": [m["width"], m["height"]],
                "pad_L": m["pad_L"],
                "pad_R": m["pad_R"],
                "pad_T": m["pad_T"],
                "pad_B": m["pad_B"],
                "cx_off": round(cx_off, 2),
                "cy_off": round(cy_off, 2),
                "mass_x_off": None if mass_x is None else round(float(mass_x), 2),
                "mass_y_off": None if mass_y is None else round(float(mass_y), 2),
                "bbox": list(m["bbox"]),
                "flagged": bool(reasons),
                "flag_reason": reasons,
            }
        )

    flagged = [r for r in rows if r.get("flagged")]
    report = {
        "bucket": str(bucket),
        "tolerance_px": args.tolerance,
        "alpha_threshold": args.alpha_threshold,
        "total": len(rows),
        "flagged_count": len(flagged),
        "ok_count": len(rows) - len(flagged),
        "flagged": flagged,
        "all": rows,
    }
    args.json_out.write_text(json.dumps(report, indent=2), encoding="utf-8")

    lines = [
        "# Cutout centering validation",
        "",
        f"- Bucket: `{bucket}`",
        f"- Alpha threshold: `{args.alpha_threshold}` (visible product, not soft fringe)",
        f"- Tolerance: +/- `{args.tolerance}` px from canvas center",
        f"- Total: **{report['total']}** | OK: **{report['ok_count']}** | Flagged: **{report['flagged_count']}**",
        "",
    ]
    if flagged:
        lines += [
            "## Flagged (reprocess)",
            "",
            "| File | mass_x | mass_y | cx_off | cy_off |",
            "|---|---:|---:|---:|---:|",
        ]
        for r in flagged:
            lines.append(
                f"| `{r.get('rel', r.get('path'))}` | {r.get('mass_x_off', '—')} | {r.get('mass_y_off', '—')} | {r.get('cx_off', '—')} | {r.get('cy_off', '—')} |"
            )
        lines.append("")
    else:
        lines += ["## Flagged", "", "_None - all cutouts within tolerance._", ""]

    args.md_out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(
        f"total={report['total']} ok={report['ok_count']} flagged={report['flagged_count']} "
        f"tol=+/-{args.tolerance}px alpha>={args.alpha_threshold}",
        flush=True,
    )
    for r in flagged:
        print(
            f"  FLAG {r.get('rel')}: mass=({r.get('mass_x_off')},{r.get('mass_y_off')}) "
            f"bbox=({r.get('cx_off')},{r.get('cy_off')}) "
            f"reason={','.join(r.get('flag_reason') or [])}",
            flush=True,
        )
    print(f"wrote {args.json_out}", flush=True)
    print(f"wrote {args.md_out}", flush=True)
    return 0 if not flagged else 2


if __name__ == "__main__":
    raise SystemExit(main())
