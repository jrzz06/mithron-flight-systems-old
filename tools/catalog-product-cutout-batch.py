import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from rembg import new_session, remove


MODEL_NAME = "bria-rmbg"
STAGE_SIZE = 1024
TARGET_MAX_EDGE = 812
MIN_MARGIN = 72
SOURCE_PADDING_MIN = 96
SOURCE_PADDING_RATIO = 0.1
TIGHT_PADDING_RATIO = 0.05
TIGHT_TARGET_MAX_EDGE = 920
TIGHT_MIN_MARGIN = 48
CATALOG_BACKGROUND = (250, 250, 250, 255)
DEFRINGE_BACKGROUND = CATALOG_BACKGROUND[:3]
DEFRINGE_LUMA_THRESHOLD = 200
DEFRINGE_ALPHA_CEILING = 220


def erode_alpha_channel(alpha_u8, radius=1):
    if radius <= 0:
        return alpha_u8
    size = radius * 2 + 1
    alpha_img = Image.fromarray(alpha_u8.astype(np.uint8), mode="L")
    return np.array(alpha_img.filter(ImageFilter.MinFilter(size)), dtype=np.uint8)


def defringe_light_halo(
    image,
    background=DEFRINGE_BACKGROUND,
    luma_threshold=DEFRINGE_LUMA_THRESHOLD,
    alpha_ceiling=DEFRINGE_ALPHA_CEILING,
):
    rgba = np.array(image.convert("RGBA"), dtype=np.float32)
    rgb = rgba[:, :, :3]
    alpha_u8 = rgba[:, :, 3].astype(np.uint8)
    alpha = alpha_u8.astype(np.float32) / 255.0

    luma = rgb.mean(axis=2)
    semi_halo = (alpha_u8 > 0) & (alpha_u8 < alpha_ceiling) & (luma > luma_threshold)

    if not np.any(semi_halo):
        return image

    bg = np.array(background, dtype=np.float32)
    alpha_safe = np.maximum(alpha, 1.0 / 255.0)
    fg_rgb = (rgb - (1.0 - alpha[..., None]) * bg) / alpha_safe[..., None]
    fg_rgb = np.clip(fg_rgb, 0, 255)

    out_rgb = np.where(semi_halo[..., None], fg_rgb, rgb)
    eroded_alpha = erode_alpha_channel(alpha_u8, radius=1)
    out_alpha = np.where(semi_halo, np.minimum(alpha_u8, eroded_alpha), alpha_u8)

    post_luma = out_rgb.mean(axis=2)
    residual_halo = (out_alpha > 0) & (out_alpha < alpha_ceiling) & (post_luma > (luma_threshold - 25))
    out_rgb = np.where(residual_halo[..., None], out_rgb * 0.72, out_rgb)
    out_alpha = np.where(
        residual_halo,
        (out_alpha.astype(np.float32) * 0.65).astype(np.uint8),
        out_alpha,
    )

    result = np.dstack([out_rgb, out_alpha.astype(np.float32)]).astype(np.uint8)
    return Image.fromarray(result, mode="RGBA")


def estimate_border_background(image):
    rgba = np.array(image.convert("RGBA"))
    height, width = rgba.shape[:2]
    strip = max(4, min(24, int(min(width, height) * 0.03)))
    border = np.concatenate([
        rgba[:strip, :, :].reshape(-1, 4),
        rgba[-strip:, :, :].reshape(-1, 4),
        rgba[:, :strip, :].reshape(-1, 4),
        rgba[:, -strip:, :].reshape(-1, 4),
    ], axis=0)
    opaque = border[border[:, 3] > 0]
    if opaque.size == 0:
        return (250, 250, 250, 255)

    red, green, blue, alpha = np.median(opaque, axis=0)
    return (int(red), int(green), int(blue), int(alpha) if alpha > 0 else 255)


def pad_source_for_cutout(image, tight_crop=False):
    rgba = image.convert("RGBA")
    if tight_crop:
        padding = max(24, int(max(rgba.width, rgba.height) * TIGHT_PADDING_RATIO))
    else:
        padding = max(SOURCE_PADDING_MIN, int(max(rgba.width, rgba.height) * SOURCE_PADDING_RATIO))
    background = estimate_border_background(rgba)
    padded = Image.new("RGBA", (rgba.width + padding * 2, rgba.height + padding * 2), background)
    padded.alpha_composite(rgba, (padding, padding))
    return padded


def alpha_bbox(alpha, threshold=8):
    ys, xs = np.where(alpha > threshold)
    if len(xs) == 0 or len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def metrics_for(image):
    rgba = np.array(image.convert("RGBA"))
    alpha = rgba[:, :, 3]
    bbox = alpha_bbox(alpha)
    coverage = float(np.count_nonzero(alpha > 8)) / float(alpha.size)
    semi = (alpha > 0) & (alpha < 220)
    semi_count = int(np.count_nonzero(semi))
    luma = rgba[:, :, :3].astype(np.float32).mean(axis=2)
    halo_count = int(np.count_nonzero(semi & (luma > 242) & (alpha < 180)))
    halo_ratio = float(halo_count) / float(semi_count) if semi_count else 0.0
    corner_alpha = int(alpha[:12, :12].max())
    corner_alpha = max(corner_alpha, int(alpha[-12:, :12].max()))
    corner_alpha = max(corner_alpha, int(alpha[:12, -12:].max()))
    corner_alpha = max(corner_alpha, int(alpha[-12:, -12:].max()))

    result = {
        "coverage": round(coverage, 5),
        "semiTransparentPixels": semi_count,
        "haloRatio": round(halo_ratio, 5),
        "cornerAlphaMax": corner_alpha,
        "bbox": None,
        "margins": None,
    }

    if bbox:
        left, top, right, bottom = bbox
        result["bbox"] = [left, top, right, bottom]
        result["margins"] = {
            "left": left,
            "top": top,
            "right": image.width - right,
            "bottom": image.height - bottom,
        }

    return result


def validate_raw_cutout(image):
    metrics = metrics_for(image)
    bbox = metrics["bbox"]
    if not bbox:
        return False, "empty_alpha", metrics
    left, top, right, bottom = bbox
    width = right - left
    height = bottom - top
    if width < 36 or height < 36:
        return False, "subject_too_small", metrics
    if metrics["coverage"] < 0.004:
        return False, "coverage_too_low", metrics
    if metrics["coverage"] > 0.86:
        return False, "background_not_removed", metrics
    raw_margin = min(left, top, image.width - right, image.height - bottom)
    if raw_margin <= 0:
        return False, "source_subject_clipped", metrics
    return True, "accepted", metrics


def stage_cutout(image, stage_size=STAGE_SIZE, tight_crop=False):
    rgba = image.convert("RGBA")
    alpha = np.array(rgba)[:, :, 3]
    bbox = alpha_bbox(alpha, threshold=8)
    if not bbox:
        raise ValueError("empty alpha after cutout")

    cropped = rgba.crop(bbox)
    cropped = cropped.filter(ImageFilter.UnsharpMask(radius=1.0, percent=72, threshold=3))
    cropped = ImageEnhance.Contrast(cropped).enhance(1.025)
    cropped = ImageEnhance.Sharpness(cropped).enhance(1.045)

    aspect = cropped.width / max(cropped.height, 1)
    min_margin = TIGHT_MIN_MARGIN if tight_crop else MIN_MARGIN
    target_edge = TIGHT_TARGET_MAX_EDGE if tight_crop else TARGET_MAX_EDGE
    max_width = stage_size - 2 * min_margin
    max_height = stage_size - 2 * min_margin

    if aspect > 2.2:
        target_width = min(max_width, 860 if not tight_crop else 940)
        target_height = max(1, int(target_width / aspect))
    elif aspect < 0.48:
        target_height = min(max_height, 840 if not tight_crop else 940)
        target_width = max(1, int(target_height * aspect))
    else:
        scale = target_edge / max(cropped.width, cropped.height)
        target_width = max(1, int(cropped.width * scale))
        target_height = max(1, int(cropped.height * scale))

    resized = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
    stage = Image.new("RGBA", (stage_size, stage_size), (0, 0, 0, 0))
    x = (stage_size - target_width) // 2
    y = (stage_size - target_height) // 2
    stage.alpha_composite(resized, (x, y))
    return stage


def validate_stage(image):
    metrics = metrics_for(image)
    bbox = metrics["bbox"]
    if not bbox:
        return False, "empty_stage_alpha", metrics
    margins = metrics["margins"] or {}
    min_margin = min(margins.values()) if margins else 0
    if min_margin < 48:
        return False, "stage_clipping_risk", metrics
    if metrics["cornerAlphaMax"] > 0:
        return False, "nontransparent_corners", metrics
    if metrics["coverage"] < 0.01:
        return False, "stage_coverage_too_low", metrics
    if metrics["coverage"] > 0.62:
        return False, "stage_coverage_too_high", metrics
    if metrics["haloRatio"] > 0.72 and metrics["semiTransparentPixels"] > 150:
        return False, "halo_risk_too_high", metrics
    return True, "accepted", metrics


def compose_catalog_studio_image(image):
    stage = image.convert("RGBA")
    studio = Image.new("RGBA", stage.size, CATALOG_BACKGROUND)
    alpha = np.array(stage)[:, :, 3]
    bbox = alpha_bbox(alpha, threshold=8)

    if bbox:
        left, top, right, bottom = bbox
        subject_width = right - left
        subject_height = bottom - top
        shadow_width = max(72, int(subject_width * 0.72))
        shadow_height = max(16, min(48, int(subject_height * 0.075)))
        center_x = (left + right) // 2
        shadow_bottom = min(stage.height - 34, bottom + max(6, shadow_height // 3))
        shadow_box = (
            center_x - shadow_width // 2,
            shadow_bottom - shadow_height,
            center_x + shadow_width // 2,
            shadow_bottom,
        )

        shadow_mask = Image.new("L", stage.size, 0)
        draw = ImageDraw.Draw(shadow_mask)
        draw.ellipse(shadow_box, fill=46)
        shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=16))
        shadow = Image.new("RGBA", stage.size, (15, 23, 42, 0))
        shadow.putalpha(shadow_mask)
        studio.alpha_composite(shadow)

    studio.alpha_composite(stage)
    return studio


def process_item(session, item, tight_crop=False):
    slug = item["slug"]
    input_path = Path(item["inputPath"])
    output_path = Path(item["outputPath"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    item_tight_crop = bool(item.get("tightCrop")) or tight_crop

    try:
        source = pad_source_for_cutout(Image.open(input_path).convert("RGBA"), tight_crop=item_tight_crop)
        raw = remove(
            source,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=238,
            alpha_matting_background_threshold=12,
            alpha_matting_erode_size=4,
            post_process_mask=True,
        ).convert("RGBA")
        raw = defringe_light_halo(raw)

        raw_ok, raw_reason, raw_metrics = validate_raw_cutout(raw)
        if not raw_ok:
            return {
                "slug": slug,
                "status": "rejected",
                "reason": raw_reason,
                "rawMetrics": raw_metrics,
                "tightCrop": item_tight_crop,
            }

        stage = stage_cutout(raw, tight_crop=item_tight_crop)
        stage_ok, stage_reason, stage_metrics = validate_stage(stage)
        if not stage_ok:
            return {
                "slug": slug,
                "status": "rejected",
                "reason": stage_reason,
                "rawMetrics": raw_metrics,
                "stageMetrics": stage_metrics,
                "tightCrop": item_tight_crop,
            }

        stage.save(output_path, "PNG", optimize=True)
        studio_output_path = item.get("studioOutputPath")
        if studio_output_path:
            studio_output_path = Path(studio_output_path)
            studio_output_path.parent.mkdir(parents=True, exist_ok=True)
            compose_catalog_studio_image(stage).save(studio_output_path, "PNG", optimize=True)

        return {
            "slug": slug,
            "status": "accepted",
            "outputPath": str(output_path),
            "studioOutputPath": str(studio_output_path) if studio_output_path else None,
            "rawMetrics": raw_metrics,
            "stageMetrics": stage_metrics,
            "tightCrop": item_tight_crop,
        }
    except Exception as error:
        return {
            "slug": slug,
            "status": "failed",
            "reason": str(error),
            "tightCrop": item_tight_crop,
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--tight-crop", action="store_true")
    args = parser.parse_args()

    batch = json.loads(Path(args.batch).read_text(encoding="utf-8"))
    items = batch.get("items", [])
    batch_tight_crop = bool(batch.get("tightCrop")) or args.tight_crop
    session = new_session(MODEL_NAME)
    results = [process_item(session, item, tight_crop=batch_tight_crop) for item in items]
    Path(args.out).write_text(
        json.dumps({"model": MODEL_NAME, "tightCrop": batch_tight_crop, "results": results}, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
