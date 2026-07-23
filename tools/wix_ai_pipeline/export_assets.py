"""Export transparent PNG, WebP, JPEG, thumbnail."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


def export_all(image: Image.Image, out_dir: Path, stem: str) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    rgba = image.convert("RGBA")
    paths: dict[str, str] = {}

    png_path = out_dir / f"{stem}.png"
    rgba.save(png_path, "PNG", optimize=True)
    paths["png"] = str(png_path)

    webp_path = out_dir / f"{stem}.webp"
    rgba.save(webp_path, "WEBP", quality=92, method=6)
    paths["webp"] = str(webp_path)

    # JPEG on light gray for compatibility
    bg = Image.new("RGB", rgba.size, (245, 245, 245))
    bg.paste(rgba, mask=rgba.split()[-1])
    jpg_path = out_dir / f"{stem}.jpg"
    bg.save(jpg_path, "JPEG", quality=92, optimize=True)
    paths["jpeg"] = str(jpg_path)

    thumb = rgba.copy()
    thumb.thumbnail((256, 256), Image.Resampling.LANCZOS)
    thumb_path = out_dir / f"{stem}.thumb.webp"
    thumb.save(thumb_path, "WEBP", quality=85, method=6)
    paths["thumb"] = str(thumb_path)

    # Preview on gray
    preview = Image.new("RGBA", rgba.size, (230, 230, 230, 255))
    preview.alpha_composite(rgba)
    preview_path = out_dir / f"{stem}.preview.png"
    preview.convert("RGB").save(preview_path, "PNG")
    paths["preview"] = str(preview_path)

    return paths
