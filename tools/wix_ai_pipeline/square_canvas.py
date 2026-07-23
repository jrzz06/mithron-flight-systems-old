"""Square 1:1 canvas helpers — preserve product scale, consistent margins."""

from __future__ import annotations

import numpy as np
from PIL import Image

# Opaque-enough pixels used for visual centering (ignores soft fringe).
DEFAULT_ALPHA_THRESHOLD = 32
# Drop connected components smaller than this fraction of the main blob.
DEFAULT_ORPHAN_AREA_RATIO = 0.02


def to_square_canvas(
    image: Image.Image,
    margin_ratio: float = 0.08,
    fill: tuple[int, int, int, int] = (0, 0, 0, 0),
) -> Image.Image:
    """
    Place the image on a square canvas with consistent margins.
    Does not stretch; letterboxes on transparent (or fill) background.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    side = max(w, h)
    margin = max(0, int(side * margin_ratio))
    canvas_side = side + margin * 2
    canvas = Image.new("RGBA", (canvas_side, canvas_side), fill)
    x = (canvas_side - w) // 2
    y = (canvas_side - h) // 2
    canvas.alpha_composite(rgba, (x, y))
    return canvas


def _largest_component_mask(mask: np.ndarray, orphan_area_ratio: float) -> np.ndarray:
    """Keep the largest opaque island; zero small disconnected fringe blobs."""
    try:
        import cv2
    except ImportError:
        return mask

    u8 = mask.astype(np.uint8)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(u8, connectivity=8)
    if num <= 2:
        return mask
    areas = stats[1:, cv2.CC_STAT_AREA]
    main_label = 1 + int(np.argmax(areas))
    main_area = int(areas.max())
    max_orphan = max(64, int(main_area * orphan_area_ratio))
    keep = np.zeros_like(mask, dtype=bool)
    for i in range(1, num):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if i == main_label or area > max_orphan:
            keep |= labels == i
    return keep


def content_mask(
    image: Image.Image,
    *,
    white_threshold: int = 248,
    alpha_threshold: int = DEFAULT_ALPHA_THRESHOLD,
    orphan_area_ratio: float = DEFAULT_ORPHAN_AREA_RATIO,
) -> np.ndarray:
    """
    Boolean mask of visible product pixels for centering.

    Prefer alpha >= alpha_threshold (drops soft fringe). When the plate is
    essentially opaque, fall back to near-white background detection.
    Small disconnected blobs are removed so fringe junk cannot skew the bbox.
    """
    rgba = image.convert("RGBA")
    arr = np.array(rgba)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]

    if np.any(alpha < 250):
        mask = alpha >= alpha_threshold
    else:
        mask = np.any(rgb < white_threshold, axis=2)

    if not np.any(mask):
        # Last resort: any non-zero alpha / non-white
        mask = alpha > 0
        if not np.any(mask):
            mask = np.any(rgb < white_threshold, axis=2)

    if np.any(mask):
        mask = _largest_component_mask(mask, orphan_area_ratio)
    return mask


def content_bbox(
    image: Image.Image,
    white_threshold: int = 248,
    *,
    alpha_threshold: int = DEFAULT_ALPHA_THRESHOLD,
    orphan_area_ratio: float = DEFAULT_ORPHAN_AREA_RATIO,
) -> tuple[int, int, int, int] | None:
    """
    Bounding box of real product pixels (tight visual crop).

    Uses alpha when present; otherwise treats near-white as background.
    Returns (left, top, right, bottom) inclusive-exclusive like PIL getbbox.
    """
    rgba = image.convert("RGBA")
    mask = content_mask(
        rgba,
        white_threshold=white_threshold,
        alpha_threshold=alpha_threshold,
        orphan_area_ratio=orphan_area_ratio,
    )
    if not np.any(mask):
        return rgba.getbbox()
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def opaque_mass_center(
    image: Image.Image,
    *,
    alpha_threshold: int = 64,
) -> tuple[float, float] | None:
    """Return (x, y) of opaque-pixel mass center in image coordinates, or None."""
    arr = np.array(image.convert("RGBA"))
    m = (arr[:, :, 3] > alpha_threshold).astype(np.float64)
    if m.sum() <= 0:
        return None
    h, w = m.shape
    mx = float((m * np.arange(w)[None, :]).sum() / m.sum())
    my = float((m * np.arange(h)[:, None]).sum() / m.sum())
    return mx, my


def measure_content_center(
    image: Image.Image,
    *,
    alpha_threshold: int = DEFAULT_ALPHA_THRESHOLD,
) -> dict | None:
    """
    Measure content bbox center vs canvas center.

    Returns offsets in px (positive = content right/down of canvas center).
    Also reports opaque-mass offsets (alpha > 64) for visual-weight checks.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    bbox = content_bbox(rgba, alpha_threshold=alpha_threshold)
    if not bbox:
        return None
    left, top, right, bottom = bbox
    cx = (left + right) / 2.0
    cy = (top + bottom) / 2.0
    mass = opaque_mass_center(rgba, alpha_threshold=64)
    mass_x_off = (mass[0] - w / 2.0) if mass else None
    mass_y_off = (mass[1] - h / 2.0) if mass else None
    return {
        "width": w,
        "height": h,
        "bbox": bbox,
        "pad_L": left,
        "pad_R": w - right,
        "pad_T": top,
        "pad_B": h - bottom,
        "cx_off": cx - w / 2.0,
        "cy_off": cy - h / 2.0,
        "mass_x_off": mass_x_off,
        "mass_y_off": mass_y_off,
    }


def fit_cutout_to_square(
    cutout: Image.Image,
    side: int | None = None,
    margin_ratio: float = 0.08,
    *,
    alpha_threshold: int = DEFAULT_ALPHA_THRESHOLD,
    mass_center: bool = True,
) -> Image.Image:
    """
    Crop tightly to the visible product (alpha bbox), then place on a square
    canvas. Placement uses opaque-mass center (alpha > 64) so L-shaped products
    look visually centered; falls back to geometric center when mass is empty.
    """
    rgba = cutout.convert("RGBA")
    # If the tight (opaque) crop is nearly empty vs soft-alpha content, fall back
    # so we don't center a fringe speck and discard the real product.
    tight = content_bbox(rgba, alpha_threshold=alpha_threshold)
    soft = content_bbox(rgba, alpha_threshold=max(1, min(8, alpha_threshold)))
    use_threshold = alpha_threshold
    if tight and soft:
        tw, th = tight[2] - tight[0], tight[3] - tight[1]
        sw, sh = soft[2] - soft[0], soft[3] - soft[1]
        soft_area = max(1, sw * sh)
        if (tw * th) / soft_area < 0.05 or tw * th < 2500:
            use_threshold = max(1, min(8, alpha_threshold))

    bbox = content_bbox(rgba, alpha_threshold=use_threshold) or rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    # Zero out near-invisible fringe left inside the crop so WebP stays clean.
    arr = np.array(rgba)
    weak = arr[:, :, 3] < use_threshold
    if np.any(weak):
        arr[weak, 3] = 0
        arr[weak, :3] = 0
        rgba = Image.fromarray(arr, "RGBA")

    target = side or max(rgba.size)
    max_inner = int(target * (1.0 - 2 * margin_ratio))

    # Asymmetric pad on the crop so opaque mass sits at the content center
    # before thumbnail — avoids clamp residual when mass is far from bbox mid.
    if mass_center:
        mass = opaque_mass_center(rgba, alpha_threshold=64)
        if mass is not None:
            fw0, fh0 = rgba.size
            dx = int(round(fw0 - 2 * mass[0]))
            dy = int(round(fh0 - 2 * mass[1]))
            pad_l, pad_r = max(0, dx), max(0, -dx)
            pad_t, pad_b = max(0, dy), max(0, -dy)
            if pad_l or pad_r or pad_t or pad_b:
                padded = Image.new(
                    "RGBA",
                    (fw0 + pad_l + pad_r, fh0 + pad_t + pad_b),
                    (0, 0, 0, 0),
                )
                padded.alpha_composite(rgba, (pad_l, pad_t))
                rgba = padded

    fitted = rgba.copy()
    fitted.thumbnail((max_inner, max_inner), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    x = (target - fitted.width) // 2
    y = (target - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    return canvas


def center_product_on_square(
    image: Image.Image,
    side: int = 1000,
    margin_ratio: float = 0.10,
    fill: tuple[int, int, int, int] = (255, 255, 255, 255),
) -> Image.Image:
    """Content-aware center on a square plate (fixes off-center Wix/white-bg shots)."""
    fitted = fit_cutout_to_square(image, side=side, margin_ratio=margin_ratio)
    if fill[3] >= 255 and fill[:3] != (0, 0, 0):
        plate = Image.new("RGBA", (side, side), fill)
        return Image.alpha_composite(plate, fitted)
    return fitted
