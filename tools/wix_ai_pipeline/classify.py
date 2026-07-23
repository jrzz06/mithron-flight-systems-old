"""Heuristic image classification for product pipeline routing."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

import numpy as np
from PIL import Image

ImageClass = Literal[
    "product_cutout_png",
    "product_photo_white",
    "product_photo_complex",
    "drone_photo",
    "marketing_banner",
    "specification_sheet",
    "ambiguous",
]


@dataclass
class Classification:
    label: ImageClass
    confidence: float
    reasons: list[str]
    width: int
    height: int
    has_alpha: bool
    aspect: float

    def to_dict(self) -> dict:
        return asdict(self)


def _border_luma_stats(rgba: np.ndarray) -> tuple[float, float, float]:
    h, w = rgba.shape[:2]
    strip = max(4, min(24, int(min(w, h) * 0.03)))
    border = np.concatenate(
        [
            rgba[:strip, :, :].reshape(-1, 4),
            rgba[-strip:, :, :].reshape(-1, 4),
            rgba[:, :strip, :].reshape(-1, 4),
            rgba[:, -strip:, :].reshape(-1, 4),
        ],
        axis=0,
    )
    opaque = border[border[:, 3] > 200]
    if opaque.size == 0:
        return 0.0, 0.0, 0.0
    rgb = opaque[:, :3].astype(np.float32)
    luma = 0.2126 * rgb[:, 0] + 0.7152 * rgb[:, 1] + 0.0722 * rgb[:, 2]
    sat = rgb.max(axis=1) - rgb.min(axis=1)
    return float(luma.mean()), float(sat.mean()), float((luma > 200).mean())


def _text_like_density(rgb: np.ndarray) -> float:
    """Rough estimate of high-frequency / text-like pixels in upper band."""
    h, w = rgb.shape[:2]
    band = rgb[: max(1, h // 4), :, :].astype(np.float32)
    gray = band.mean(axis=2)
    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    edges = (gx + gy) > 28
    return float(edges.mean())


def _alpha_coverage(alpha: np.ndarray) -> float:
    return float(np.count_nonzero(alpha > 8) / alpha.size)


def classify_image(image: Image.Image) -> Classification:
    rgba = np.array(image.convert("RGBA"))
    h, w = rgba.shape[:2]
    aspect = w / max(h, 1)
    alpha = rgba[:, :, 3]
    has_alpha = bool(alpha.min() < 250) and bool((alpha < 10).any())
    coverage = _alpha_coverage(alpha)
    luma_mean, sat_mean, white_ratio = _border_luma_stats(rgba)
    text_density = _text_like_density(rgba[:, :, :3])
    reasons: list[str] = []

    # Already a cutout
    if has_alpha and coverage < 0.92 and coverage > 0.02:
        corner = max(
            int(alpha[:8, :8].max()),
            int(alpha[-8:, :8].max()),
            int(alpha[:8, -8:].max()),
            int(alpha[-8:, -8:].max()),
        )
        if corner < 40:
            reasons.append(f"transparent corners + coverage={coverage:.3f}")
            return Classification("product_cutout_png", 0.92, reasons, w, h, True, aspect)

    # Wide marketing banner
    if aspect >= 2.2 or aspect <= 0.45:
        reasons.append(f"extreme aspect={aspect:.3f}")
        return Classification("marketing_banner", 0.88, reasons, w, h, has_alpha, aspect)

    # Tall multi-panel / spec sheets
    if (h / max(w, 1)) >= 1.55 and text_density > 0.08:
        reasons.append(f"tall panel h/w={h/max(w,1):.2f} text={text_density:.3f}")
        return Classification("specification_sheet", 0.78, reasons, w, h, has_alpha, aspect)

    # Spec sheet: high text density + bright background
    if text_density > 0.18 and white_ratio > 0.55 and luma_mean > 180:
        reasons.append(f"text_density={text_density:.3f} white_ratio={white_ratio:.3f}")
        return Classification("specification_sheet", 0.8, reasons, w, h, has_alpha, aspect)

    # Promo overlay band (upper text)
    if text_density > 0.22 and aspect > 1.3:
        reasons.append(f"promo text band density={text_density:.3f}")
        return Classification("marketing_banner", 0.75, reasons, w, h, has_alpha, aspect)

    # White studio product photo
    if white_ratio > 0.7 and sat_mean < 35 and luma_mean > 200:
        reasons.append(f"white studio border luma={luma_mean:.1f} sat={sat_mean:.1f}")
        # Flying / outdoor drones usually have sky/ground — lower white_ratio
        return Classification("product_photo_white", 0.85, reasons, w, h, has_alpha, aspect)

    # Drone photography heuristic: outdoor color variance, mid aspect
    rgb = rgba[:, :, :3].astype(np.float32)
    color_std = float(rgb.std())
    if color_std > 45 and 0.7 <= aspect <= 1.8 and white_ratio < 0.45:
        reasons.append(f"outdoor variance std={color_std:.1f}")
        return Classification("drone_photo", 0.7, reasons, w, h, has_alpha, aspect)

    # Complex product photo default
    if white_ratio < 0.55:
        reasons.append("non-white background → complex cutout")
        return Classification("product_photo_complex", 0.72, reasons, w, h, has_alpha, aspect)

    reasons.append("fallback white-ish product photo")
    return Classification("product_photo_white", 0.55, reasons, w, h, has_alpha, aspect)
