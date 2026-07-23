"""Padded Real-ESRGAN enhance — same output WxH, tile 512–768, no boundary crop."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

TOOLS_DIR = Path(__file__).resolve().parent.parent
DEFAULT_BINARY = TOOLS_DIR / "realesrgan-bin" / "realesrgan-ncnn-vulkan.exe"
MODEL_NAME = "realesrgan-x4plus"
NATIVE_SCALE = 4  # must match model native scale (x4plus); we always resize back to original WxH
PAD_RATIO = 0.12  # 12% within 10–15%
TILE_SIZE = 256  # safer on RTX 2050 4GB; reduces tile-seam corruption on small sources
MAX_ESRGAN_EDGE = 512
# Note: realesrgan-ncnn-vulkan exposes -t tile; internal overlap is built-in.


def add_transparent_padding(image: Image.Image, pad_ratio: float = PAD_RATIO) -> tuple[Image.Image, int]:
    """Center product on larger transparent canvas. Returns (padded, pad_px)."""
    rgba = image.convert("RGBA")
    pad = max(8, int(max(rgba.width, rgba.height) * pad_ratio))
    canvas = Image.new("RGBA", (rgba.width + pad * 2, rgba.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(rgba, (pad, pad))
    return canvas, pad


def remove_padding(image: Image.Image, pad: int, orig_size: tuple[int, int]) -> Image.Image:
    w, h = orig_size
    cropped = image.crop((pad, pad, pad + w, pad + h))
    if cropped.size != orig_size:
        cropped = cropped.resize(orig_size, Image.Resampling.LANCZOS)
    return cropped


def jpeg_artifact_denoise(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    mask = alpha > 8
    if not np.any(mask):
        return rgb
    # Light bilateral — preserve edges
    den = cv2.bilateralFilter(rgb, d=5, sigmaColor=25, sigmaSpace=25)
    out = rgb.astype(np.float32)
    out[mask] = den[mask].astype(np.float32)
    return np.clip(out, 0, 255).astype(np.uint8)


def lighting_contrast(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    mask = alpha > 8
    if not np.any(mask):
        return rgb
    out = rgb.astype(np.float32).copy()
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
    l2 = clahe.apply(l)
    merged = cv2.merge([l2, a, b])
    corrected = cv2.cvtColor(merged, cv2.COLOR_LAB2RGB).astype(np.float32)
    blend = 0.3
    out[mask] = out[mask] * (1 - blend) + corrected[mask] * blend
    return np.clip(out, 0, 255).astype(np.uint8)


def run_realesrgan(
    binary: Path,
    input_png: Path,
    output_png: Path,
    tile: int = TILE_SIZE,
) -> None:
    models_dir = binary.parent / "models"
    command = [
        str(binary),
        "-i",
        str(input_png),
        "-o",
        str(output_png),
        "-n",
        MODEL_NAME,
        "-s",
        str(NATIVE_SCALE),
        "-t",
        str(tile),
        "-f",
        "png",
        "-g",
        "0",  # force GPU 0 (Vulkan)
    ]
    if models_dir.exists():
        command.extend(["-m", str(models_dir)])
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"Real-ESRGAN failed: {detail}")


def sharpen_texture(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    rgb = rgba.convert("RGB")
    sharp = rgb.filter(ImageFilter.UnsharpMask(radius=1.4, percent=110, threshold=2))
    contrast = ImageEnhance.Contrast(sharp).enhance(1.06)
    color = ImageEnhance.Color(contrast).enhance(1.03)
    out = color.convert("RGBA")
    # Restore original alpha exactly
    out.putalpha(rgba.getchannel("A"))
    return out


def classical_only_enhance(image: Image.Image, pad_ratio: float = PAD_RATIO) -> Image.Image:
    """VRAM-safe fallback: pad → denoise/lighting/sharpen → unpad (no ESRGAN)."""
    orig_size = image.size
    rgba = image.convert("RGBA")
    padded, pad = add_transparent_padding(rgba, pad_ratio=pad_ratio)
    arr = np.array(padded)
    alpha = arr[:, :, 3]
    rgb = jpeg_artifact_denoise(arr[:, :, :3], alpha)
    rgb = lighting_contrast(rgb, alpha)
    restored = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    restored = sharpen_texture(restored)
    return remove_padding(restored, pad, orig_size)


def enhance_image(
    image: Image.Image,
    binary: Path | None = None,
    tile: int = TILE_SIZE,
    pad_ratio: float = PAD_RATIO,
    target_size: tuple[int, int] | None = None,
) -> Image.Image:
    """
    Hard rules:
    - pad 10–15% before AI
    - ESRGAN on GPU (Vulkan) with large tiles when memory allows
    - resize back, unpad → original WxH (or target_size if set)
    - alpha locked from pre-enhance (after pad/unpad alignment)
    - large sources are temporarily downscaled for ESRGAN then restored
    - on OOM / ESRGAN failure → classical_only_enhance (same dims, no hallucination)

    When target_size is set (e.g. 1000x1000), keep ESRGAN's high-res detail and
    resample once to that size (identity/pose preserved; no redesign).
    """
    binary = binary or DEFAULT_BINARY
    out_size = target_size or image.size
    if not binary.exists():
        base = classical_only_enhance(image, pad_ratio=pad_ratio)
        if base.size != out_size:
            base = base.resize(out_size, Image.Resampling.LANCZOS)
        return base

    orig_size = image.size
    rgba = image.convert("RGBA")
    padded, pad = add_transparent_padding(rgba, pad_ratio=pad_ratio)
    pad_size = padded.size

    arr = np.array(padded)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    rgb = jpeg_artifact_denoise(rgb, alpha)
    rgb = lighting_contrast(rgb, alpha)

    # Composite on neutral gray for ESRGAN (handles alpha poorly); keep alpha aside
    gray_bg = np.full_like(rgb, 245)
    a = (alpha.astype(np.float32) / 255.0)[..., None]
    composed = (rgb.astype(np.float32) * a + gray_bg.astype(np.float32) * (1 - a)).astype(np.uint8)
    work = Image.fromarray(composed, "RGB")

    # Temporary downscale for VRAM-safe ESRGAN (output still restored to pad_size / orig_size)
    max_edge = max(work.size)
    esrgan_input = work
    if max_edge > MAX_ESRGAN_EDGE:
        scale = MAX_ESRGAN_EDGE / float(max_edge)
        esrgan_input = work.resize(
            (max(1, int(work.width * scale)), max(1, int(work.height * scale))),
            Image.Resampling.LANCZOS,
        )

    try:
        with tempfile.TemporaryDirectory(prefix="wix-ai-esrgan-") as tmp:
            tmp_path = Path(tmp)
            in_png = tmp_path / "in.png"
            out_png = tmp_path / "out.png"
            esrgan_input.save(in_png, "PNG")
            run_realesrgan(binary, in_png, out_png, tile=tile)
            upscaled = Image.open(out_png).convert("RGB")

        # Sanity: reject obviously broken ESRGAN tiles (near-zero correlation / huge shift)
        ref = np.array(work.resize(upscaled.size, Image.Resampling.BILINEAR), dtype=np.float32)
        cand = np.array(upscaled, dtype=np.float32)
        mad = float(np.mean(np.abs(ref - cand)))
        if mad > 90:
            raise RuntimeError(f"ESRGAN output looks corrupted (mad={mad:.1f})")

        if target_size is None:
            # Legacy: exact original WxH after unpad
            restored_rgb = upscaled.resize(pad_size, Image.Resampling.LANCZOS)
            restored = restored_rgb.convert("RGBA")
            restored.putalpha(Image.fromarray(alpha, mode="L"))
            restored = sharpen_texture(restored)
            final = remove_padding(restored, pad, orig_size)
            if final.size != orig_size:
                final = final.resize(orig_size, Image.Resampling.LANCZOS)
                final.putalpha(rgba.getchannel("A").resize(orig_size, Image.Resampling.NEAREST))
            return final

        # HQ path: keep ESRGAN detail headroom, then resample once to target
        want_w, want_h = out_size
        hi_w = max(pad_size[0], int(upscaled.width * (pad_size[0] / max(1, esrgan_input.width))))
        hi_h = max(pad_size[1], int(upscaled.height * (pad_size[1] / max(1, esrgan_input.height))))
        restored_rgb = upscaled.resize((hi_w, hi_h), Image.Resampling.LANCZOS)
        scale_x = hi_w / float(pad_size[0])
        scale_y = hi_h / float(pad_size[1])
        pad_x = int(round(pad * scale_x))
        pad_y = int(round(pad * scale_y))
        inner_w = max(1, hi_w - pad_x * 2)
        inner_h = max(1, hi_h - pad_y * 2)
        cropped = restored_rgb.crop((pad_x, pad_y, pad_x + inner_w, pad_y + inner_h))
        alpha_hi = Image.fromarray(alpha, mode="L").resize((hi_w, hi_h), Image.Resampling.BILINEAR)
        alpha_crop = alpha_hi.crop((pad_x, pad_y, pad_x + inner_w, pad_y + inner_h))
        restored = cropped.convert("RGBA")
        restored.putalpha(alpha_crop)
        restored = sharpen_texture(restored)
        if restored.size != (want_w, want_h):
            restored = restored.resize((want_w, want_h), Image.Resampling.LANCZOS)
        return restored
    except Exception as exc:  # noqa: BLE001
        print(f"  ESRGAN fallback to classical ({exc})")
        base = classical_only_enhance(image, pad_ratio=pad_ratio)
        if base.size != out_size:
            base = base.resize(out_size, Image.Resampling.LANCZOS)
        return base


def enhance_to_square(
    image: Image.Image,
    side: int = 1000,
    **kwargs,
) -> Image.Image:
    """Enhance then fit to a square canvas at `side` (default 1000×1000)."""
    from .square_canvas import to_square_canvas

    # Enhance toward a square at least as large as side for detail headroom
    sq = to_square_canvas(image.convert("RGBA"), margin_ratio=0.0, fill=(245, 245, 245, 255))
    enhanced = enhance_image(sq, target_size=(side, side), **kwargs)
    if enhanced.size != (side, side):
        enhanced = enhanced.resize((side, side), Image.Resampling.LANCZOS)
    return enhanced.convert("RGB")
