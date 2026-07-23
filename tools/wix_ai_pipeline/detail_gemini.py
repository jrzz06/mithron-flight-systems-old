"""
Gemini Flash Image generative restore for product photos.

Calls Google Generative Language API (gemini-2.5-flash-image by default)
with the source image + identity-locked e-commerce restore prompt.

Env:
  GEMINI_API_KEY (required)
  GEMINI_IMAGE_MODEL (default: gemini-2.5-flash-image)
"""

from __future__ import annotations

import base64
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


DEFAULT_MODEL = "gemini-3.1-flash-image"

RESTORE_PROMPT = """You are an expert e-commerce product image restoration AI.

Regenerate this product photo with TRUE macro-studio quality while preserving the EXACT product identity.

STRICT RULES:
- Preserve exact shape, proportions, geometry, colors, labels, connectors, threads, screws, holes, cables.
- Do NOT redesign, invent, replace, add, or remove any part.
- Do NOT change viewing angle or orientation.
- Fix low resolution, pixelation, JPEG artifacts, blur, soft focus, noise, poor texture.
- Reconstruct realistic material detail: plastic grain, metal machining, brass, chrome, rubber.
- Clean even studio softbox lighting. Natural highlights. No dramatic colored light.
- Output a single product on a plain pure white seamless background (#FFFFFF).
- No shadows under the product (or only a very soft contact shadow).
- No text, watermarks, props, or extra objects.
- Photorealistic catalog quality like Apple / DJI / Amazon premium listings.
"""


@dataclass
class GeminiDetailResult:
    image: Image.Image
    mode_used: str
    notes: list[str]
    model: str


def _load_dotenv_key() -> str:
    """Read GEMINI_API_KEY from process env or nearby .env.local files."""
    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY") or "").strip()
    if key:
        return key
    here = Path(__file__).resolve()
    candidates = [
        here.parents[2] / ".env.local",
        here.parents[2] / ".env",
        Path.cwd() / ".env.local",
        Path.cwd() / ".env",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                if k.strip() in ("GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"):
                    val = v.strip().strip('"').strip("'")
                    if val:
                        return val
        except OSError:
            continue
    return ""


def _pil_to_jpeg_b64(image: Image.Image, max_side: int = 1280, quality: int = 92) -> tuple[str, str]:
    rgb = image.convert("RGB")
    w, h = rgb.size
    m = max(w, h)
    if m > max_side:
        scale = max_side / float(m)
        rgb = rgb.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    rgb.save(buf, format="JPEG", quality=quality, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii"), "image/jpeg"


def _decode_inline_image(data_b64: str) -> Image.Image:
    raw = base64.b64decode(data_b64)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def generative_macro_detail_gemini(
    product_or_photo: Image.Image,
    *,
    prompt: str = RESTORE_PROMPT,
    model: str | None = None,
    timeout_s: float = 120.0,
) -> GeminiDetailResult:
    notes: list[str] = []
    api_key = _load_dotenv_key()
    if not api_key:
        return GeminiDetailResult(
            image=product_or_photo.convert("RGBA"),
            mode_used="skipped_no_api_key",
            notes=["GEMINI_API_KEY missing"],
            model="",
        )

    model_id = (model or os.environ.get("GEMINI_IMAGE_MODEL") or DEFAULT_MODEL).strip()
    notes.append(f"model={model_id}")
    img_b64, mime = _pil_to_jpeg_b64(product_or_photo)
    notes.append(f"input_mime={mime} b64_len={len(img_b64)}")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(model_id, safe='')}:generateContent"
        f"?key={urllib.parse.quote(api_key, safe='')}"
    )
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime, "data": img_b64}},
                ],
            }
        ],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        notes.append(f"http_{exc.code}:{err_body[:400]}")
        return GeminiDetailResult(
            image=product_or_photo.convert("RGBA"),
            mode_used="fallback_http_error",
            notes=notes,
            model=model_id,
        )
    except Exception as exc:  # noqa: BLE001
        notes.append(f"request_failed:{exc}")
        return GeminiDetailResult(
            image=product_or_photo.convert("RGBA"),
            mode_used="fallback_request_error",
            notes=notes,
            model=model_id,
        )

    if payload.get("error"):
        notes.append(f"api_error:{payload['error']}")
        return GeminiDetailResult(
            image=product_or_photo.convert("RGBA"),
            mode_used="fallback_api_error",
            notes=notes,
            model=model_id,
        )

    parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    inline = None
    for part in parts:
        data = part.get("inlineData") or part.get("inline_data")
        if data and data.get("data"):
            inline = data
            break
    if not inline:
        notes.append("no_inline_image_in_response")
        texts = [p.get("text") for p in parts if p.get("text")]
        if texts:
            notes.append(f"text={texts[0][:200]}")
        return GeminiDetailResult(
            image=product_or_photo.convert("RGBA"),
            mode_used="fallback_no_image",
            notes=notes,
            model=model_id,
        )

    out = _decode_inline_image(inline["data"])
    notes.append(f"output_size={list(out.size)}")
    return GeminiDetailResult(
        image=out,
        mode_used="gemini_flash_image",
        notes=notes,
        model=model_id,
    )
