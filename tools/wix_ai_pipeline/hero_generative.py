"""
Mask-locked generative marketing hero via StableDiffusionInpaintPipeline.

Generates a premium environment around a transparent cutout, then hard-composites
the original product pixels back so identity/pose cannot drift.

Runs SD at a VRAM-safe size (512–640 on RTX 2050 4GB), then upscales the plate
and re-composites the full-res cutout to the requested canvas (e.g. 1000×1000).

Falls back to studio composite when CUDA/torch unavailable, OOM, or identity gate fails.
Set FORCE_SD_CPU=1 to attempt CPU SD inpaint despite missing CUDA.
"""

from __future__ import annotations

import gc
import os
import sys
from dataclasses import dataclass
from typing import Literal

import numpy as np
from PIL import Image, ImageFilter

from .showcase import compose_showcase, drop_shadow


HeroMode = Literal["generative", "studio"]


@dataclass
class HeroResult:
    image: Image.Image
    mode_used: str
    notes: list[str]


@dataclass(frozen=True)
class GenerativeCapability:
    available: bool
    reason: str
    torch_version: str | None = None
    cuda: bool = False
    force_cpu: bool = False


# Keep well under CLIP's 77-token limit
HERO_PROMPT = (
    "empty premium product photo backdrop, dark charcoal studio gradient, "
    "soft cinematic light, subtle cool rim, seamless industrial surface, "
    "soft contact shadow, DJI Apple style, sharp photorealistic, no objects"
)
HERO_NEGATIVE = (
    "product, drone, object, watermark, text, logo, clutter, cartoon, "
    "blurry, low quality, oversaturated, neon glow, busy background"
)


def probe_generative_capability() -> GenerativeCapability:
    """Non-throwing probe: whether SD inpaint should be attempted."""
    force_cpu = os.environ.get("FORCE_SD_CPU") == "1"
    try:
        import torch
    except Exception as exc:  # noqa: BLE001
        return GenerativeCapability(
            available=False,
            reason=f"torch_import_failed: {exc}",
        )

    torch_version = getattr(torch, "__version__", "unknown")
    cuda = bool(torch.cuda.is_available())
    if cuda:
        return GenerativeCapability(
            available=True,
            reason="cuda_ready",
            torch_version=torch_version,
            cuda=True,
            force_cpu=force_cpu,
        )

    py = f"{sys.version_info.major}.{sys.version_info.minor}"
    if force_cpu:
        return GenerativeCapability(
            available=True,
            reason=f"force_sd_cpu=1 on Python {py} (torch={torch_version}, cuda=false)",
            torch_version=torch_version,
            cuda=False,
            force_cpu=True,
        )

    return GenerativeCapability(
        available=False,
        reason=(
            f"pytorch_cuda_unavailable on Python {py} "
            f"(torch={torch_version}, cuda=false); "
            "degrading to studio-composite (set FORCE_SD_CPU=1 to force CPU SD)"
        ),
        torch_version=torch_version,
        cuda=False,
        force_cpu=False,
    )


def _product_mask(cutout: Image.Image, dilate_px: int = 6) -> Image.Image:
    alpha = cutout.convert("RGBA").split()[-1]
    if dilate_px > 0:
        alpha = alpha.filter(ImageFilter.MaxFilter(dilate_px * 2 + 1))
    return alpha


def _place_product(cutout: Image.Image, side: int, margin_ratio: float = 0.11) -> tuple[Image.Image, int, int]:
    product = cutout.convert("RGBA")
    fitted = product.copy()
    max_inner = int(side * (1.0 - 2 * margin_ratio))
    fitted.thumbnail((max_inner, max_inner), Image.Resampling.LANCZOS)
    x = (side - fitted.width) // 2
    y = int(side * 0.52 - fitted.height * 0.55)
    y = max(int(side * 0.08), min(y, side - fitted.height - int(side * 0.08)))
    full = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    full.alpha_composite(fitted, (x, y))
    return full, x, y


def _hard_composite_product(background: Image.Image, cutout: Image.Image) -> Image.Image:
    """Force original cutout RGB onto background — identity lock."""
    bg = background.convert("RGBA")
    product = cutout.convert("RGBA")
    if product.size != bg.size:
        product = product.resize(bg.size, Image.Resampling.LANCZOS)
    shadow = drop_shadow(
        product,
        blur=max(10, bg.width // 60),
        opacity=100,
        offset=(0, max(8, bg.height // 50)),
    )
    out = Image.alpha_composite(bg, shadow)
    out = Image.alpha_composite(out, product)
    return out.convert("RGB")


def _identity_mad(placed_cutout: Image.Image, composed: Image.Image) -> float:
    """Compare product pixels using the *same* placement used for hard composite."""
    cut = placed_cutout.convert("RGBA")
    comp = composed.convert("RGB")
    if comp.size != cut.size:
        comp = comp.resize(cut.size, Image.Resampling.BILINEAR)
    arr_c = np.array(cut)
    arr_o = np.array(comp)
    mask = arr_c[:, :, 3] > 32
    if not np.any(mask):
        return 999.0
    diff = np.abs(arr_c[:, :, :3].astype(np.float32) - arr_o.astype(np.float32))
    return float(diff[mask].mean())


def _studio_fallback(square_cut: Image.Image, side: int, notes: list[str], reason: str) -> HeroResult:
    notes.append(reason)
    notes.append("fell_back_to_studio_composite")
    img = compose_showcase(square_cut, canvas_size=(side, side))
    return HeroResult(image=img, mode_used="studio_fallback", notes=notes)


def _sd_side_for_vram(target_side: int, cuda: bool) -> int:
    """Pick inpaint resolution. Final export still uses target_side via hard composite."""
    if not cuda:
        return 512
    # RTX 2050 4GB: 640 is usually safe with attention slicing + CPU offload
    preferred = 640 if target_side >= 768 else 512
    return (min(preferred, 768) // 8) * 8


def _try_diffusers_inpaint(
    cutout: Image.Image,
    canvas_size: tuple[int, int],
) -> tuple[Image.Image, Image.Image, float]:
    """
    Run StableDiffusionInpaintPipeline on background only, then hard-composite at full res.
    Returns (composed_rgb, placed_cutout_rgba, identity_mad).
    """
    import torch
    from diffusers import StableDiffusionInpaintPipeline

    capability = probe_generative_capability()
    if not capability.available:
        raise RuntimeError(capability.reason)

    target_side = max(512, max(canvas_size))
    sd_side = _sd_side_for_vram(target_side, capability.cuda)

    # Build low-res plate for SD
    plate = Image.new("RGB", (sd_side, sd_side), (42, 46, 52))
    full_sd, _x, _y = _place_product(cutout, sd_side)
    init = Image.alpha_composite(plate.convert("RGBA"), full_sd).convert("RGB")

    # Inpaint mask: white = generate (background), black = keep (product)
    mask = Image.new("L", (sd_side, sd_side), 255)
    keep = _product_mask(full_sd, dilate_px=max(6, sd_side // 80))
    mask.paste(0, (0, 0), keep)

    use_cuda = capability.cuda
    dtype = torch.float16 if use_cuda else torch.float32
    device = "cuda" if use_cuda else "cpu"
    steps = 28 if use_cuda else 12

    pipe = StableDiffusionInpaintPipeline.from_pretrained(
        "runwayml/stable-diffusion-inpainting",
        torch_dtype=dtype,
        safety_checker=None,
        requires_safety_checker=False,
    )
    if use_cuda:
        try:
            pipe.enable_attention_slicing("max")
            if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_slicing"):
                pipe.vae.enable_slicing()
            pipe.enable_model_cpu_offload()
        except Exception:
            pipe = pipe.to(device)
            try:
                pipe.enable_attention_slicing()
            except Exception:
                pass
    else:
        pipe = pipe.to(device)

    try:
        result = pipe(
            prompt=HERO_PROMPT,
            negative_prompt=HERO_NEGATIVE,
            image=init,
            mask_image=mask,
            height=sd_side,
            width=sd_side,
            num_inference_steps=steps,
            guidance_scale=7.5,
            strength=0.92,
        ).images[0]
    finally:
        del pipe
        gc.collect()
        if use_cuda:
            try:
                torch.cuda.empty_cache()
            except Exception:
                pass

    # Upscale generated plate to target, then hard-composite full-res cutout (identity lock)
    plate_hq = result.resize((target_side, target_side), Image.Resampling.LANCZOS)
    full_hq, _, _ = _place_product(cutout, target_side)
    composed = _hard_composite_product(plate_hq, full_hq)
    mad = _identity_mad(full_hq, composed)
    return composed, full_hq, mad


def compose_marketing_hero(
    cutout: Image.Image,
    canvas_size: tuple[int, int] | None = None,
    mode: HeroMode = "generative",
) -> HeroResult:
    notes: list[str] = []
    size = canvas_size or cutout.size
    side = max(size)
    square_cut = cutout.convert("RGBA")
    if square_cut.size != (side, side):
        from .square_canvas import fit_cutout_to_square

        square_cut = fit_cutout_to_square(square_cut, side=side, margin_ratio=0.08)

    if mode == "studio":
        img = compose_showcase(square_cut, canvas_size=(side, side))
        return HeroResult(image=img, mode_used="studio", notes=["requested studio mode"])

    capability = probe_generative_capability()
    notes.append(f"generative_probe={capability.reason}")
    if not capability.available:
        return _studio_fallback(square_cut, side, notes, f"generative_skipped: {capability.reason}")

    try:
        sd_side = _sd_side_for_vram(side, capability.cuda)
        notes.append(f"sd_inpaint_side={sd_side} export_side={side}")
        img, _placed, mad = _try_diffusers_inpaint(square_cut, (side, side))
        notes.append(f"generative_identity_mad={mad:.2f}")
        # Hard-composite guarantees product RGB; gate only catches plumbing bugs.
        if mad > 6.0:
            raise RuntimeError(f"identity gate failed mad={mad:.2f}")
        return HeroResult(image=img, mode_used="generative", notes=notes)
    except Exception as exc:  # noqa: BLE001
        return _studio_fallback(square_cut, side, notes, f"generative_failed: {exc}")
