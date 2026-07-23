"""
Generative macro-detail restore for tiny / soft product cutouts (RTX 2050 safe).

Uses a *photoreal* SD1.5-family checkpoint (Realistic Vision) via img2img to
synthesize material detail, then lightly locks color/silhouette from the source.

Base SD 1.5 looked painterly on tiny JPEGs — Realistic Vision + less blend washout
is the default for e-commerce macro texture.
"""

from __future__ import annotations

import gc
import os
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

from .hero_generative import probe_generative_capability


DETAIL_PROMPT = (
    "RAW photo, commercial product macro photograph, ultra sharp focus, "
    "injection-molded black plastic with fine surface grain, "
    "knurled blue push-fit collar, chrome retaining ring, "
    "brass hex nut with crisp flats, precision machined metal threads, "
    "natural specular highlights, softbox studio lighting, "
    "85mm macro lens, f/8, catalog e-commerce, photorealistic"
)
DETAIL_NEGATIVE = (
    "painting, illustration, cartoon, anime, 3d render, cgi, plastic toy look, "
    "oil paint, watercolor, airbrushed, oversmoothed, soft focus, blurry, "
    "lowres, jpeg artifacts, pixelation, noise, deformed, warped, "
    "extra parts, missing parts, duplicate object, wrong geometry, "
    "watermark, text, logo, neon, oversaturated, halo, fringe, "
    "glamour, beauty filter, plastic skin"
)

# Photoreal SD1.5 checkpoint (much better materials than base runwayml SD1.5)
DEFAULT_SD_MODEL = "SG161222/Realistic_Vision_V5.1_noVAE"
FALLBACK_SD_MODEL = "runwayml/stable-diffusion-v1-5"


@dataclass
class DetailResult:
    image: Image.Image
    mode_used: str
    notes: list[str]
    strength: float
    sd_side: int


def _sd_side(cuda: bool) -> int:
    # 512 safest on RTX 2050 4GB with CPU offload
    override = os.environ.get("DETAIL_SD_SIDE", "").strip()
    if override.isdigit():
        return max(448, min(640, int(override) // 8 * 8))
    return 512 if cuda else 448


def _model_id() -> str:
    return os.environ.get("DETAIL_SD_MODEL", DEFAULT_SD_MODEL).strip() or DEFAULT_SD_MODEL


def _compose_on_studio(product: Image.Image, side: int) -> tuple[Image.Image, Image.Image]:
    """
    Center RGBA product on studio gray RGB for SD; keep transparent RGBA alpha
    only on the product (never bake opaque background into the cutout).
    """
    rgba = product.convert("RGBA")
    fitted = rgba.copy()
    margin = int(side * 0.04)
    max_inner = side - margin * 2
    fitted.thumbnail((max_inner, max_inner), Image.Resampling.LANCZOS)

    transparent = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    x = (side - fitted.width) // 2
    y = (side - fitted.height) // 2
    transparent.alpha_composite(fitted, (x, y))

    gray = Image.new("RGB", (side, side), (245, 245, 245))
    init = Image.alpha_composite(gray.convert("RGBA"), transparent).convert("RGB")
    return init, transparent


def _match_color_stats(ref: Image.Image, gen: Image.Image, alpha: Image.Image) -> Image.Image:
    """Gentle color lock — preserve generative texture, only shift mean toward ref."""
    r = np.array(ref.convert("RGB"), dtype=np.float32)
    g = np.array(gen.convert("RGB"), dtype=np.float32)
    a = np.array(alpha.convert("L"), dtype=np.float32)
    mask = a > 32
    if not np.any(mask):
        return gen.convert("RGB")
    out = g.copy()
    # Soft mean-only pull (keep gen contrast/texture)
    pull = 0.55
    for c in range(3):
        r_mean = float(r[:, :, c][mask].mean())
        g_mean = float(g[:, :, c][mask].mean())
        shifted = g[:, :, c] + (r_mean - g_mean) * pull
        out[:, :, c] = np.where(mask, shifted, g[:, :, c])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def _structure_lock_blend(
    base: Image.Image,
    gen: Image.Image,
    alpha: Image.Image,
    *,
    gen_weight: float = 0.88,
) -> Image.Image:
    """
    Prefer generative pixels for materials; keep only very-low-frequency shape from base.
    Previous frequency blend washed out SD detail → painterly mush.
    """
    b = np.array(base.convert("RGB"), dtype=np.float32)
    g = np.array(gen.convert("RGB"), dtype=np.float32)
    a = np.array(alpha.convert("L"), dtype=np.float32) / 255.0
    # Very soft structure from base (shape), materials from gen
    b_low = np.array(base.convert("RGB").filter(ImageFilter.GaussianBlur(5)), dtype=np.float32)
    g_low = np.array(gen.convert("RGB").filter(ImageFilter.GaussianBlur(5)), dtype=np.float32)
    structure = 0.18
    fused = gen_weight * (g - g_low + b_low * structure + g_low * (1.0 - structure)) + (
        1.0 - gen_weight
    ) * b
    # Simpler & clearer: mostly gen
    fused = gen_weight * g + (1.0 - gen_weight) * b
    # Reintroduce a touch of base low-freq for silhouette stability
    fused = fused * 0.88 + b_low * 0.12
    mask3 = a[..., None]
    out = fused * mask3 + b * (1.0 - mask3)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def _crisp_finish(rgb: Image.Image, alpha: Image.Image) -> Image.Image:
    """Light clarity without ringing — applied only on opaque product."""
    sharp = rgb.filter(ImageFilter.UnsharpMask(radius=1.2, percent=85, threshold=2))
    contrast = ImageEnhance.Contrast(sharp).enhance(1.04)
    arr = np.array(contrast, dtype=np.float32)
    base = np.array(rgb, dtype=np.float32)
    a = (np.array(alpha.convert("L"), dtype=np.float32) / 255.0)[..., None]
    out = arr * a + base * (1.0 - a)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def _extract_product(rgba_plate: Image.Image, gen_rgb: Image.Image) -> Image.Image:
    alpha = rgba_plate.getchannel("A")
    out = gen_rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def _load_img2img_pipe(model_id: str, dtype, notes: list[str]):
    from diffusers import (
        DPMSolverMultistepScheduler,
        StableDiffusionImg2ImgPipeline,
    )

    kwargs = dict(
        torch_dtype=dtype,
        safety_checker=None,
        requires_safety_checker=False,
    )
    # Realistic Vision noVAE needs SD1.5 VAE
    if "noVAE" in model_id or "novae" in model_id.lower():
        try:
            from diffusers import AutoencoderKL

            vae = AutoencoderKL.from_pretrained("stabilityai/sd-vae-ft-mse", torch_dtype=dtype)
            kwargs["vae"] = vae
            notes.append("vae=sd-vae-ft-mse")
        except Exception as exc:  # noqa: BLE001
            notes.append(f"vae_load_warn:{exc}")

    pipe = StableDiffusionImg2ImgPipeline.from_pretrained(model_id, **kwargs)
    try:
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            pipe.scheduler.config,
            use_karras_sigmas=True,
            algorithm_type="dpmsolver++",
        )
        notes.append("scheduler=dpmpp_2m_karras")
    except Exception as exc:  # noqa: BLE001
        notes.append(f"scheduler_default:{exc}")
    return pipe


def generative_macro_detail(
    product_rgba: Image.Image,
    *,
    strength: float = 0.45,
    steps: int | None = None,
    guidance: float = 5.5,
    detail_mix: float = 0.88,
    refine: bool = True,
) -> DetailResult:
    """
    Photoreal macro-detail for a transparent product crop.

    detail_mix is mapped to gen_weight (how much Realistic Vision output we keep).
    """
    notes: list[str] = []
    capability = probe_generative_capability()
    notes.append(f"probe={capability.reason}")
    if not capability.available:
        return DetailResult(
            image=product_rgba.convert("RGBA"),
            mode_used="skipped_no_cuda",
            notes=notes,
            strength=0.0,
            sd_side=0,
        )

    import torch

    use_cuda = capability.cuda
    sd_side = _sd_side(use_cuda)
    # Realistic Vision: mid strength invents texture without melting geometry
    strength = float(np.clip(strength, 0.32, 0.58))
    if steps is None:
        steps = 36 if use_cuda else 16

    init_rgb, plate_rgba = _compose_on_studio(product_rgba, sd_side)
    base_rgb = init_rgb

    dtype = torch.float16 if use_cuda else torch.float32
    device = "cuda" if use_cuda else "cpu"
    model_id = _model_id()
    notes.append(f"model={model_id} side={sd_side} strength={strength:.2f} steps={steps}")

    pipe = None
    try:
        try:
            pipe = _load_img2img_pipe(model_id, dtype, notes)
        except Exception as exc:  # noqa: BLE001
            notes.append(f"primary_load_failed:{exc}")
            if model_id != FALLBACK_SD_MODEL:
                notes.append(f"fallback_model={FALLBACK_SD_MODEL}")
                pipe = _load_img2img_pipe(FALLBACK_SD_MODEL, dtype, notes)
            else:
                raise
    except Exception as exc:  # noqa: BLE001
        notes.append(f"img2img_load_failed:{exc}")
        return DetailResult(
            image=product_rgba.convert("RGBA"),
            mode_used="fallback_input",
            notes=notes,
            strength=0.0,
            sd_side=sd_side,
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
        gen = pipe(
            prompt=DETAIL_PROMPT,
            negative_prompt=DETAIL_NEGATIVE,
            image=init_rgb,
            strength=strength,
            guidance_scale=guidance,
            num_inference_steps=steps,
        ).images[0]

        if refine and use_cuda:
            # Second pass: lower strength polish for crisp materials
            refine_s = float(np.clip(strength * 0.55, 0.22, 0.35))
            notes.append(f"refine_strength={refine_s:.2f}")
            gen = pipe(
                prompt=DETAIL_PROMPT + ", extreme detail, sharp metal edges",
                negative_prompt=DETAIL_NEGATIVE,
                image=gen,
                strength=refine_s,
                guidance_scale=guidance,
                num_inference_steps=max(20, steps // 2),
            ).images[0]
    except Exception as exc:  # noqa: BLE001
        notes.append(f"img2img_failed:{exc}")
        return DetailResult(
            image=product_rgba.convert("RGBA"),
            mode_used="fallback_oom_or_error",
            notes=notes,
            strength=strength,
            sd_side=sd_side,
        )
    finally:
        try:
            del pipe
        except Exception:
            pass
        gc.collect()
        if use_cuda:
            try:
                torch.cuda.empty_cache()
            except Exception:
                pass

    alpha = plate_rgba.getchannel("A")
    gen = _match_color_stats(base_rgb, gen, alpha)
    blended = _structure_lock_blend(base_rgb, gen, alpha, gen_weight=float(np.clip(detail_mix, 0.7, 0.95)))
    blended = _crisp_finish(blended, alpha)
    out = _extract_product(plate_rgba, blended)
    notes.append("color_softlock+gen_weighted_blend+unsharp")
    return DetailResult(
        image=out,
        mode_used="sd_img2img_photoreal",
        notes=notes,
        strength=strength,
        sd_side=sd_side,
    )
