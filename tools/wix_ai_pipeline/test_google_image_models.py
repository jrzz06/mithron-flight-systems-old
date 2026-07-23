#!/usr/bin/env python3
"""
One-by-one Google image model test on a product photo (edit/enhance).

Tries Gemini native image-edit models first (multimodal), then Imagen 4
text-to-image variants (prompt-only, since Imagen is T2I).

Usage:
  python -u tools/wix_ai_pipeline/test_google_image_models.py --input path.png --out tools/.wix-ai-pipeline/demo-imagen-models
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parent.parent
sys.path.insert(0, str(TOOLS_DIR.parent))

from wix_ai_pipeline.detail_gemini import _load_dotenv_key  # noqa: E402
from wix_ai_pipeline.export_web import save_png_master  # noqa: E402

PROMPT = (
    "Commercial product photography of a brand-new item. "
    "Clean, isolated object on a pure transparent or seamless white background, "
    "background removed. Ultra-high resolution 4K, crisp micro-details, "
    "authentic textures, no artificial artifacts or fake enhancements. "
    "Professional studio lighting, 1:1 square aspect ratio, masterpiece quality. "
    "Preserve the EXACT product identity, shape, colors, cage structure, zip-ties, "
    "propellers, and LED lighting from the reference photo. Do not redesign."
)

# Ordered test list — IDs verified via models.list on this API key
GEMINI_EDIT_MODELS = [
    ("nano-banana-2", "gemini-3.1-flash-image"),
    ("nano-banana-2-preview", "gemini-3.1-flash-image-preview"),
    ("nano-banana-pro", "gemini-3-pro-image"),
    ("nano-banana-pro-preview", "gemini-3-pro-image-preview"),
    ("nano-banana-pro-alias", "nano-banana-pro-preview"),
    ("gemini-2.5-flash-image", "gemini-2.5-flash-image"),
]

IMAGEN_T2I_MODELS = [
    ("imagen-4-generate", "imagen-4.0-generate-001"),
    ("imagen-4-ultra", "imagen-4.0-ultra-generate-001"),
    ("imagen-4-fast", "imagen-4.0-fast-generate-001"),
]


def _jpeg_b64(image: Image.Image, max_side: int = 1024) -> tuple[str, str]:
    rgb = image.convert("RGB")
    m = max(rgb.size)
    if m > max_side:
        s = max_side / float(m)
        rgb = rgb.resize((max(1, int(rgb.width * s)), max(1, int(rgb.height * s))), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    rgb.save(buf, format="JPEG", quality=90, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii"), "image/jpeg"


def _save_b64_image(data_b64: str, path: Path) -> tuple[int, int]:
    raw = base64.b64decode(data_b64)
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    save_png_master(img, path)
    return img.size


def call_gemini_edit(api_key: str, model: str, image: Image.Image, prompt: str, timeout: float = 180.0) -> dict:
    img_b64, mime = _jpeg_b64(image)
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(model, safe='')}:generateContent?key={urllib.parse.quote(api_key, safe='')}"
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
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        elapsed = time.perf_counter() - t0
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        return {"ok": False, "status": exc.code, "error": err[:800], "elapsed_s": time.perf_counter() - t0}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "status": None, "error": str(exc), "elapsed_s": time.perf_counter() - t0}

    parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    inline = None
    texts: list[str] = []
    for part in parts:
        if part.get("text"):
            texts.append(part["text"])
        data = part.get("inlineData") or part.get("inline_data")
        if data and data.get("data"):
            inline = data
    if not inline:
        return {
            "ok": False,
            "status": 200,
            "error": "no_image_in_response",
            "text": " ".join(texts)[:300],
            "elapsed_s": elapsed,
            "raw_keys": list(payload.keys()),
        }
    return {
        "ok": True,
        "elapsed_s": elapsed,
        "mime": inline.get("mimeType") or inline.get("mime_type") or "image/png",
        "data": inline["data"],
        "text": " ".join(texts)[:300],
    }


def call_imagen_t2i(api_key: str, model: str, prompt: str, timeout: float = 180.0) -> dict:
    """Imagen 4 via :predict (text-to-image)."""
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(model, safe='')}:predict?key={urllib.parse.quote(api_key, safe='')}"
    )
    body = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1",
            "personGeneration": "dont_allow",
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        elapsed = time.perf_counter() - t0
    except urllib.error.HTTPError as exc:
        err = exc.read().decode("utf-8", errors="replace")
        return {"ok": False, "status": exc.code, "error": err[:800], "elapsed_s": time.perf_counter() - t0}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "status": None, "error": str(exc), "elapsed_s": time.perf_counter() - t0}

    preds = payload.get("predictions") or payload.get("generatedImages") or []
    if not preds:
        # Some responses nest differently
        return {"ok": False, "status": 200, "error": f"no_predictions keys={list(payload.keys())}", "elapsed_s": elapsed}

    first = preds[0]
    b64 = (
        first.get("bytesBase64Encoded")
        or first.get("image", {}).get("imageBytes")
        or first.get("binary")
    )
    if not b64:
        return {"ok": False, "status": 200, "error": f"no_b64 keys={list(first.keys())}", "elapsed_s": elapsed}
    return {"ok": True, "elapsed_s": elapsed, "data": b64, "mime": "image/png"}


def list_image_models(api_key: str) -> list[str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={urllib.parse.quote(api_key, safe='')}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"list_models failed: {exc}")
        return []
    out = []
    for m in data.get("models", []):
        name = (m.get("name") or "").replace("models/", "")
        methods = m.get("supportedGenerationMethods") or []
        low = name.lower()
        if "generateContent" in methods or "predict" in methods:
            if any(x in low for x in ("image", "imagen", "banana")):
                out.append(name)
    return sorted(set(out))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", default="tools/.wix-ai-pipeline/demo-imagen-models")
    parser.add_argument("--only", default="", help="Comma label filter e.g. nano-banana-2,imagen-4-fast")
    parser.add_argument("--skip-imagen", action="store_true")
    parser.add_argument("--skip-gemini", action="store_true")
    args = parser.parse_args()

    api_key = _load_dotenv_key()
    if not api_key:
        raise SystemExit("GEMINI_API_KEY missing")

    out_dir = Path(args.out)
    if not out_dir.is_absolute():
        out_dir = PROJECT_ROOT / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    src = Image.open(args.input)
    src.load()
    save_png_master(src.convert("RGBA"), out_dir / "00-source.png")
    print(f"source={src.size}")

    available = list_image_models(api_key)
    print("available_image_models:")
    for n in available:
        print(f"  - {n}")
    (out_dir / "available-models.json").write_text(json.dumps(available, indent=2), encoding="utf-8")

    only = {x.strip() for x in args.only.split(",") if x.strip()}
    results: list[dict] = []

    if not args.skip_gemini:
        print("\n=== Gemini native edit/gen (with uploaded reference) ===")
        for label, model in GEMINI_EDIT_MODELS:
            if only and label not in only and model not in only:
                continue
            print(f"\n[{label}] model={model} ...")
            res = call_gemini_edit(api_key, model, src, PROMPT)
            entry = {"label": label, "model": model, "kind": "gemini_edit", **{k: v for k, v in res.items() if k != "data"}}
            if res.get("ok"):
                path = out_dir / f"{label}.png"
                size = _save_b64_image(res["data"], path)
                entry["output"] = str(path)
                entry["output_size"] = list(size)
                print(f"  OK {size} in {res['elapsed_s']:.1f}s -> {path.name}")
            else:
                print(f"  FAIL status={res.get('status')} err={str(res.get('error'))[:240]}")
            results.append(entry)
            time.sleep(2)

    if not args.skip_imagen:
        print("\n=== Imagen 4 text-to-image (no pixel reference; prompt describes product) ===")
        # Enrich T2I prompt with a short visual description from the photo context
        t2i_prompt = (
            PROMPT
            + " Subject: pink spherical plastic cage drone with blue LED dome, black propellers, white zip ties."
        )
        for label, model in IMAGEN_T2I_MODELS:
            if only and label not in only and model not in only:
                continue
            print(f"\n[{label}] model={model} ...")
            res = call_imagen_t2i(api_key, model, t2i_prompt)
            entry = {"label": label, "model": model, "kind": "imagen_t2i", **{k: v for k, v in res.items() if k != "data"}}
            if res.get("ok"):
                path = out_dir / f"{label}.png"
                size = _save_b64_image(res["data"], path)
                entry["output"] = str(path)
                entry["output_size"] = list(size)
                print(f"  OK {size} in {res['elapsed_s']:.1f}s -> {path.name}")
            else:
                print(f"  FAIL status={res.get('status')} err={str(res.get('error'))[:240]}")
            results.append(entry)
            time.sleep(2)

    report = {"prompt": PROMPT, "results": results, "available_models": available}
    (out_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nreport -> {out_dir / 'report.json'}")
    ok_n = sum(1 for r in results if r.get("ok"))
    print(f"done ok={ok_n}/{len(results)}")


if __name__ == "__main__":
    main()
