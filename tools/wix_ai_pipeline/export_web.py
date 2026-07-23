"""Web-optimized exports — storefront cutout profile (1000×1000, q88–90, ~80–150 KB)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

# Recommended storefront cutout profile
STOREFRONT_SIDE = 1000
STOREFRONT_QUALITY_START = 90
STOREFRONT_QUALITY_FLOOR = 88
STOREFRONT_SIZE_TARGET_MAX = 150 * 1024  # 150 KB
STOREFRONT_SIZE_SOFT_MAX = 180 * 1024  # accept + flag over_budget


def save_png_master(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def save_webp_hq(image: Image.Image, path: Path, *, quality: int = 92) -> None:
    """
    High-quality WebP for storefront delivery.
    quality ~90–94 keeps fine detail with strong size reduction vs PNG.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs: dict = {
        "quality": quality,
        "method": 6,
    }
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        kwargs["lossless"] = False
    image.save(path, "WEBP", **kwargs)


def save_webp_storefront(
    image: Image.Image,
    path: Path,
    *,
    quality_start: int = STOREFRONT_QUALITY_START,
    quality_floor: int = STOREFRONT_QUALITY_FLOOR,
    target_max_bytes: int = STOREFRONT_SIZE_TARGET_MAX,
    soft_max_bytes: int = STOREFRONT_SIZE_SOFT_MAX,
) -> dict:
    """
    Encode WebP for storefront cutouts/heroes.
    Start at quality_start (90); if > target_max, step down to quality_floor (88).
    Never go below quality_floor. Returns encode metadata for report.json.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = image.size
    if w != STOREFRONT_SIDE or h != STOREFRONT_SIDE:
        raise ValueError(f"Expected {STOREFRONT_SIDE}×{STOREFRONT_SIDE}, got {w}×{h}")

    chosen_q = quality_start
    over_budget = False

    def _encode(q: int) -> int:
        kwargs: dict = {"quality": q, "method": 6, "lossless": False}
        image.save(path, "WEBP", **kwargs)
        return path.stat().st_size

    size = _encode(chosen_q)
    if size > target_max_bytes and quality_floor < quality_start:
        chosen_q = quality_floor
        size = _encode(chosen_q)

    if size > soft_max_bytes:
        over_budget = True
    elif size > target_max_bytes:
        over_budget = True

    return {
        "path": str(path),
        "width": w,
        "height": h,
        "quality": chosen_q,
        "file_size_bytes": size,
        "over_budget": over_budget,
        "target_max_bytes": target_max_bytes,
    }
