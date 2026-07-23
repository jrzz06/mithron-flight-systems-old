"""Supabase helpers for dual-asset pipeline (retrieve primary image)."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


def load_env(project_root: Path) -> None:
    for name in (".env.local", ".env"):
        path = project_root / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip().lstrip("\ufeff")
            if k and k not in os.environ:
                os.environ[k] = v.strip().strip('"').strip("'")


def supabase_get(project_root: Path, path_query: str) -> Any:
    load_env(project_root)
    url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not key:
        raise RuntimeError("Missing Supabase credentials in .env.local")
    req = urllib.request.Request(
        f"{url}/rest/v1/{path_query}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_product_primary(project_root: Path, slug: str) -> dict:
    rows = supabase_get(
        project_root,
        f"mithron_products?select=slug,name,image,hero,gallery&slug=eq.{urllib.parse.quote(slug)}&limit=1",
    )
    if not rows:
        raise RuntimeError(f"Product not found: {slug}")
    return rows[0]


def resolve_primary_image_url(product: dict) -> str | None:
    image = product.get("image") or {}
    src = image.get("src") if isinstance(image, dict) else None
    if isinstance(src, str) and src.strip():
        return src.strip()
    gallery = product.get("gallery") or []
    if isinstance(gallery, list) and gallery:
        g0 = gallery[0]
        if isinstance(g0, dict) and isinstance(g0.get("src"), str):
            return g0["src"].strip()
    return None


def download_image(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "mithron-ai-dual-assets/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        dest.write_bytes(resp.read())
    return dest
