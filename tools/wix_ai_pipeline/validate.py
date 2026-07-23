"""Final validation gate before export."""

from __future__ import annotations

import numpy as np
from PIL import Image

from .cutout import validate_alpha


def validate_output(
    original: Image.Image,
    result: Image.Image,
    *,
    require_alpha: bool = True,
) -> tuple[bool, list[str]]:
    issues: list[str] = []
    ow, oh = original.size
    rw, rh = result.size
    if (rw, rh) != (ow, oh):
        issues.append(f"dimension_mismatch expected={ow}x{oh} got={rw}x{rh}")

    o_aspect = ow / max(oh, 1)
    r_aspect = rw / max(rh, 1)
    if abs(o_aspect - r_aspect) > 0.001:
        issues.append(f"aspect_mismatch {o_aspect:.5f} vs {r_aspect:.5f}")

    orig_a = np.array(original.convert("RGBA"))[:, :, 3]
    res = np.array(result.convert("RGBA"))
    res_a = res[:, :, 3]

    if require_alpha:
        ok_alpha, alpha_issues = validate_alpha(result)
        if not ok_alpha:
            issues.extend(alpha_issues)

        # Geometry drift: alpha IoU
        o_mask = orig_a > 8
        r_mask = res_a > 8
        if o_mask.any() and r_mask.any():
            inter = np.logical_and(o_mask, r_mask).sum()
            union = np.logical_or(o_mask, r_mask).sum()
            iou = float(inter) / float(union) if union else 0.0
            if iou < 0.92:
                issues.append(f"geometry_shift_iou={iou:.3f}")

        # Shift / rotate proxy: bbox center drift
        def bbox(mask: np.ndarray):
            ys, xs = np.where(mask)
            if len(xs) == 0:
                return None
            return xs.min(), ys.min(), xs.max(), ys.max()

        bo, br = bbox(o_mask), bbox(r_mask)
        if bo and br:
            ocx = (bo[0] + bo[2]) / 2
            ocy = (bo[1] + bo[3]) / 2
            rcx = (br[0] + br[2]) / 2
            rcy = (br[1] + br[3]) / 2
            drift = ((ocx - rcx) ** 2 + (ocy - rcy) ** 2) ** 0.5
            if drift > max(3.0, 0.01 * max(ow, oh)):
                issues.append(f"product_shifted_px={drift:.1f}")

    # Visible AI tile artifacts: high periodic energy (simple check)
    rgb = res[:, :, :3].astype(np.float32)
    if rgb.size:
        gx = np.abs(np.diff(rgb.mean(axis=2), axis=1)).mean()
        if gx > 40:
            issues.append(f"possible_grid_artifact_gx={gx:.1f}")

    return len(issues) == 0, issues
