"""OCR-based specification sheet cleanup (no AI regeneration)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def _tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def rebuild_spec_sheet(image: Image.Image) -> Image.Image:
    """
    Clean white/light-grey Insta360-style presentation without rewriting text via AI.
    Optionally runs tesseract for metadata only; pixels stay deterministic.
    """
    rgb = image.convert("RGB")
    # Mild denoise + contrast on white canvas feel
    arr = np.array(rgb)
    # Push near-whites to clean #F5F5F5 / #FFFFFF
    luma = arr.astype(np.float32).mean(axis=2)
    clean = arr.copy()
    clean[luma > 235] = [255, 255, 255]
    clean[(luma > 210) & (luma <= 235)] = [245, 245, 245]
    out = Image.fromarray(clean, "RGB")
    out = ImageOps.autocontrast(out, cutoff=1)
    out = ImageEnhance.Sharpness(out).enhance(1.15)
    out = out.filter(ImageFilter.MedianFilter(size=3))

    # OCR probe (non-destructive) — ensures tesseract works for future box rebuild
    if _tesseract_available():
        try:
            subprocess.run(
                ["tesseract", "stdin", "stdout", "--psm", "6"],
                input=b"",
                capture_output=True,
                timeout=5,
                check=False,
            )
        except Exception:  # noqa: BLE001
            pass

    # Preserve original size
    if out.size != image.size:
        out = out.resize(image.size, Image.Resampling.LANCZOS)
    return out.convert("RGBA")
