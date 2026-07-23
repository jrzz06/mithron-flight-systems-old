"""Compose a lit product showcase from a transparent cutout (pose preserved)."""

from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance


def _radial_gradient(size: tuple[int, int], center: tuple[float, float], inner: tuple[int, int, int], outer: tuple[int, int, int]) -> Image.Image:
    w, h = size
    cx, cy = center
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    max_dist = math.sqrt(max(cx, w - cx) ** 2 + max(cy, h - cy) ** 2) or 1.0
    t = np.clip(dist / max_dist, 0.0, 1.0)
    # Ease for a soft studio falloff
    t = t ** 1.35
    rgb = np.empty((h, w, 3), dtype=np.float32)
    for i in range(3):
        rgb[:, :, i] = inner[i] * (1.0 - t) + outer[i] * t
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def _soft_floor(size: tuple[int, int], horizon_y: float) -> Image.Image:
    """Subtle floor plane + vignette for product sitting presence."""
    w, h = size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    y0 = int(h * horizon_y)
    for i in range(y0, h):
        t = (i - y0) / max(1, h - y0)
        alpha = int(28 + 55 * t)
        # Cool slate floor wash
        draw.line([(0, i), (w, i)], fill=(18, 28, 42, alpha))
    # Soft elliptical contact shadow near center-bottom
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    cx, cy = w // 2, int(h * 0.78)
    rx, ry = int(w * 0.28), int(h * 0.06)
    sdraw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(8, w // 80)))
    overlay = Image.alpha_composite(overlay, shadow)
    return overlay


def build_showcase_background(size: tuple[int, int]) -> Image.Image:
    """Premium dark-studio plate with cool rim light — product-agnostic."""
    w, h = size
    # Outer charcoal → inner cool highlight behind product
    base = _radial_gradient(
        (w, h),
        center=(w * 0.5, h * 0.42),
        inner=(48, 68, 92),
        outer=(12, 16, 24),
    )
    # Secondary cool rim from top-left
    rim = _radial_gradient(
        (w, h),
        center=(w * 0.22, h * 0.18),
        inner=(70, 110, 150),
        outer=(12, 16, 24),
    )
    blended = Image.blend(base, rim, alpha=0.28)
    rgba = blended.convert("RGBA")
    rgba = Image.alpha_composite(rgba, _soft_floor((w, h), horizon_y=0.62))
    # Gentle vignette
    vig = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    vdraw = ImageDraw.Draw(vig)
    for i in range(0, max(w, h) // 3, 4):
        alpha = int(min(110, i * 0.55))
        vdraw.rectangle([i, i, w - i, h - i], outline=(0, 0, 0, alpha))
    vig = vig.filter(ImageFilter.GaussianBlur(radius=max(12, w // 40)))
    return Image.alpha_composite(rgba, vig).convert("RGB")


def drop_shadow(cutout: Image.Image, blur: int = 18, opacity: int = 110, offset: tuple[int, int] = (0, 14)) -> Image.Image:
    rgba = cutout.convert("RGBA")
    alpha = rgba.split()[-1]
    shadow = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    shadow.putalpha(alpha.point(lambda a: int(a * opacity / 255)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=blur))
    canvas = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    canvas.paste(shadow, offset, shadow)
    return canvas


def compose_showcase(
    cutout: Image.Image,
    canvas_size: tuple[int, int] | None = None,
    product_scale: float = 0.78,
) -> Image.Image:
    """
    Place the transparent cutout onto a lit studio background.
    Preserves product pose/design — only background + lighting wrap change.
    """
    cut = cutout.convert("RGBA")
    # Trim excess empty margins so product fills the showcase nicely
    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)

    size = canvas_size or cutout.size
    w, h = size
    bg = build_showcase_background(size)

    # Fit product into frame
    max_w, max_h = int(w * product_scale), int(h * product_scale)
    fitted = cut.copy()
    fitted.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)

    # Slight clarity/contrast lift for showcase presence (no pose change)
    rgb = fitted.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
    rgb = ImageEnhance.Color(rgb).enhance(1.05)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.12)
    fitted = rgb.convert("RGBA")
    fitted.putalpha(cut.split()[-1].resize(fitted.size, Image.Resampling.BILINEAR) if fitted.size != cut.size else cut.split()[-1])
    # Re-apply alpha from resized cut accurately
    alpha = cut.split()[-1].resize(fitted.size, Image.Resampling.LANCZOS)
    fitted.putalpha(alpha)

    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (w - fitted.width) // 2
    y = int(h * 0.52 - fitted.height * 0.55)
    y = max(int(h * 0.08), min(y, h - fitted.height - int(h * 0.08)))

    shadow = drop_shadow(fitted, blur=max(12, w // 70), opacity=120, offset=(0, max(10, h // 55)))
    layer.alpha_composite(shadow, (x, y))
    layer.alpha_composite(fitted, (x, y))

    out = bg.convert("RGBA")
    out.alpha_composite(layer)
    return out.convert("RGB")
