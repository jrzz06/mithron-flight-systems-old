#!/usr/bin/env python3
"""
Process one product (or batch) through the Wix AI image pipeline.

Usage:
  python tools/wix_ai_pipeline/run_product.py --slug source-10-liter-dual-agri-drone
  python tools/wix_ai_pipeline/run_product.py --slug source-10-liter-dual-agri-drone --upload
  python tools/wix_ai_pipeline/run_product.py --batch --limit 20
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parent.parent
sys.path.insert(0, str(TOOLS_DIR.parent))

from wix_ai_pipeline.classify import classify_image
from wix_ai_pipeline.cutout import remove_background, validate_alpha
from wix_ai_pipeline.enhance import enhance_image
from wix_ai_pipeline.export_assets import export_all
from wix_ai_pipeline.gpu_setup import preload_cuda_dlls
from wix_ai_pipeline.spec_sheet import rebuild_spec_sheet
from wix_ai_pipeline.validate import validate_output

STAGING = TOOLS_DIR.parent / ".wix-ai-pipeline"
DEMO_SLUG = "source-10-liter-dual-agri-drone"


def load_env() -> None:
    for name in (".env.local", ".env"):
        path = PROJECT_ROOT / name
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


def supabase_get(path_query: str):
    load_env()
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


def _norm_name(value: str | None) -> str:
    if not value:
        return ""
    return "".join(ch.lower() for ch in value if ch.isalnum())


def load_wix_product(slug: str, db: dict | None = None) -> dict | None:
    snap_path = PROJECT_ROOT / "data" / "wix-catalog.snapshot.json"
    if not snap_path.exists():
        return None
    snap = json.loads(snap_path.read_text(encoding="utf-8"))
    products = snap.get("products", [])
    wix_slug = slug[7:] if slug.startswith("source-") else slug
    catalog_id = f"mithron-{wix_slug}"
    db_catalog = (db or {}).get("source_catalog_id") or ""
    db_url = ((db or {}).get("source_url") or "").rstrip("/").lower()
    db_name = _norm_name((db or {}).get("name"))

    for p in products:
        if db_catalog and p.get("source_catalog_id") == db_catalog:
            return {"match": "db_source_catalog_id", "confidence": "trusted", **p}
    for p in products:
        if p.get("source_catalog_id") == catalog_id:
            return {"match": "source_catalog_id", "confidence": "trusted", **p}
    for p in products:
        if p.get("wix_slug") == wix_slug:
            return {"match": "wix_slug", "confidence": "trusted", **p}
    if db_url:
        for p in products:
            src = (p.get("source_url") or "").rstrip("/").lower()
            if src and src == db_url:
                return {"match": "source_url", "confidence": "trusted", **p}
    # Unique normalized name match (trusted only when exactly one hit)
    if db_name:
        hits = [p for p in products if _norm_name(p.get("name")) == db_name]
        if len(hits) == 1:
            return {"match": "unique_normalized_name", "confidence": "trusted", **hits[0]}
    return None


def fetch_db_product(slug: str) -> dict:
    rows = supabase_get(
        f"mithron_products?select=slug,name,image,hero,gallery,source_images,source_catalog_id,source_url"
        f"&slug=eq.{urllib.parse.quote(slug)}&limit=1"
    )
    if not rows:
        raise RuntimeError(f"Product not found in DB: {slug}")
    return rows[0]


def collect_media_urls(wix: dict | None, db: dict) -> list[str]:
    urls: list[str] = []
    if wix and wix.get("media_urls"):
        urls.extend([u for u in wix["media_urls"] if isinstance(u, str) and u.strip()])
    if not urls:
        for field in ("gallery", "source_images"):
            items = db.get(field) or []
            if isinstance(items, list):
                for it in items:
                    if isinstance(it, str):
                        urls.append(it)
                    elif isinstance(it, dict) and it.get("src"):
                        urls.append(it["src"])
        for field in ("image", "hero"):
            it = db.get(field)
            if isinstance(it, dict) and it.get("src"):
                urls.append(it["src"])
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        u = u.strip()
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "mithron-wix-ai-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        dest.write_bytes(resp.read())
    return dest


def process_frame(image: Image.Image, index: int, work_dir: Path, rembg_model: str = "bria-rmbg") -> dict:
    clf = classify_image(image)
    frame: dict = {
        "index": index,
        "classification": clf.to_dict(),
        "status": "pending",
        "original_size": list(image.size),
    }

    if clf.label == "marketing_banner":
        frame["status"] = "skipped"
        frame["verdict"] = "SKIP"
        frame["reason"] = "marketing_banner"
        return frame

    if clf.label == "specification_sheet":
        cleaned = rebuild_spec_sheet(image)
        ok, issues = validate_output(image, cleaned, require_alpha=False)
        if not ok:
            frame.update({"status": "rejected", "verdict": "LOSS", "issues": issues})
            return frame
        paths = export_all(cleaned, work_dir / "export", f"{index:02d}-spec")
        frame.update({"status": "ok", "verdict": "WIN", "method": "spec_ocr_clean", "exports": paths})
        return frame

    cut, method = remove_background(image, clf.label, model=rembg_model)
    cut.save(work_dir / f"{index:02d}-cutout.png")
    ok_a, a_issues = validate_alpha(cut)
    soft_alpha = False
    # Existing catalog cutouts often have soft edges / tiny holes — enhance anyway if coverage is sane
    if not ok_a:
        soft_ok = clf.label == "product_cutout_png" and not any(
            x.startswith("missing_product") or x.startswith("background_not_removed") for x in a_issues
        )
        if not soft_ok:
            frame.update({"status": "rejected", "verdict": "LOSS", "method": method, "issues": a_issues})
            return frame
        soft_alpha = True
        frame["alpha_warnings"] = a_issues
        method = f"{method}+soft_alpha"

    try:
        enhanced = enhance_image(cut)
    except Exception as exc:  # noqa: BLE001
        frame.update({"status": "rejected", "verdict": "LOSS", "method": method, "issues": [f"enhance_failed:{exc}"]})
        return frame

    ok, issues = validate_output(cut, enhanced, require_alpha=not soft_alpha)
    if not ok:
        # Soft cutouts: only hard-fail on dimension/aspect/geometry, ignore residual alpha noise
        hard = [x for x in issues if x.startswith("dimension_") or x.startswith("aspect_") or x.startswith("geometry_") or x.startswith("product_shifted")]
        if soft_alpha and not hard:
            ok = True
            frame["alpha_warnings"] = list(frame.get("alpha_warnings") or []) + issues
        else:
            enhanced.save(work_dir / f"{index:02d}-rejected.png")
            frame.update({"status": "rejected", "verdict": "LOSS", "method": method, "issues": issues})
            return frame

    paths = export_all(enhanced, work_dir / "export", f"{index:02d}-final")
    frame.update(
        {
            "status": "ok",
            "verdict": "WIN",
            "method": method,
            "exports": paths,
            "final_size": list(enhanced.size),
        }
    )
    return frame


def ensure_wix_snapshot() -> None:
    snap = PROJECT_ROOT / "data" / "wix-catalog.snapshot.json"
    if snap.exists():
        return
    print("Fetching Wix catalog snapshot...")
    subprocess.run(["npm", "run", "products:fetch-wix"], cwd=str(PROJECT_ROOT), check=False, shell=True)


def process_product(slug: str, rembg_model: str = "bria-rmbg", upload: bool = False) -> dict:
    work_dir = STAGING / slug
    existing = work_dir / "report.json"
    if existing.exists():
        try:
            prev = json.loads(existing.read_text(encoding="utf-8"))
            if prev.get("verdict") in ("WIN", "PARTIAL") and prev.get("wins", 0) > 0:
                print(f"[{slug}] skip - existing {prev.get('verdict')} report")
                if upload and prev.get("upload_exit") != 0:
                    upload_script = TOOLS_DIR / "upload_product.mjs"
                    result = subprocess.run(
                        ["node", str(upload_script), "--slug", slug],
                        cwd=str(PROJECT_ROOT),
                        capture_output=True,
                        text=True,
                    )
                    prev["upload_exit"] = result.returncode
                    prev["upload_out"] = (result.stdout or "")[-2000:]
                    existing.write_text(json.dumps(prev, indent=2), encoding="utf-8")
                return prev
        except Exception:  # noqa: BLE001
            pass

    gpu = preload_cuda_dlls()
    ensure_wix_snapshot()
    db = fetch_db_product(slug)
    wix = load_wix_product(slug, db)

    match_report = {
        "db_slug": slug,
        "db_name": db.get("name"),
        "db_sku": db.get("sku"),
        "wix_found": bool(wix),
        "match_method": wix.get("match") if wix else None,
        "confidence": wix.get("confidence") if wix else "LOSS",
        "wix_name": wix.get("name") if wix else None,
        "wix_slug": wix.get("wix_slug") if wix else None,
        "gpu": gpu,
    }

    work_dir = STAGING / slug
    work_dir.mkdir(parents=True, exist_ok=True)
    (work_dir / "source").mkdir(exist_ok=True)

    if not wix or match_report["confidence"] != "trusted":
        # Still allow DB-gallery fallback for demo continuity
        match_report["fallback"] = "db_gallery"
        print(f"[{slug}] Wix trusted match missing - falling back to DB media URLs")

    urls = collect_media_urls(wix, db)
    match_report["media_count"] = len(urls)
    if not urls:
        report = {
            "slug": slug,
            "verdict": "LOSS",
            "reason": "no_media_urls",
            "match": match_report,
            "frames": [],
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        (work_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        return report

    frames = []
    for i, url in enumerate(urls):
        lower = url.lower()
        ext = ".png" if ".png" in lower else (".webp" if ".webp" in lower else ".jpg")
        src_path = work_dir / "source" / f"{i:02d}{ext}"
        print(f"[{slug}] download {i + 1}/{len(urls)}")
        try:
            download(url, src_path)
            img = Image.open(src_path)
            img.load()
        except Exception as exc:  # noqa: BLE001
            frames.append({"index": i, "status": "rejected", "verdict": "LOSS", "issues": [str(exc)], "url": url})
            continue
        print(f"[{slug}] process frame {i}…")
        frame = process_frame(img, i, work_dir, rembg_model=rembg_model)
        frame["source_url"] = url
        frames.append(frame)
        print(f"[{slug}] frame {i} -> {frame.get('verdict')} ({frame.get('classification', {}).get('label')})")

    wins = sum(1 for f in frames if f.get("verdict") == "WIN")
    losses = sum(1 for f in frames if f.get("verdict") == "LOSS")
    skips = sum(1 for f in frames if f.get("verdict") == "SKIP")
    if wins > 0 and losses == 0:
        product_verdict = "WIN"
    elif wins > 0:
        product_verdict = "PARTIAL"
    else:
        product_verdict = "LOSS"

    report = {
        "slug": slug,
        "name": db.get("name"),
        "verdict": product_verdict,
        "wins": wins,
        "losses": losses,
        "skips": skips,
        "match": match_report,
        "frames": frames,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    (work_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (work_dir / "classify-report.json").write_text(
        json.dumps([f.get("classification") for f in frames], indent=2),
        encoding="utf-8",
    )

    if upload and product_verdict in ("WIN", "PARTIAL"):
        upload_script = TOOLS_DIR / "upload_product.mjs"
        result = subprocess.run(
            ["node", str(upload_script), "--slug", slug],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
        )
        report["upload_exit"] = result.returncode
        report["upload_out"] = (result.stdout or "")[-2000:]
        if result.returncode != 0:
            report["upload_err"] = (result.stderr or "")[-2000:]
        (work_dir / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    return report


def list_product_slugs(limit: int = 0) -> list[str]:
    inv = TOOLS_DIR.parent / ".product-image-inventory.json"
    if inv.exists():
        data = json.loads(inv.read_text(encoding="utf-8"))
        slugs = [r["slug"] for r in (data.get("rows") or []) if r.get("slug")]
    else:
        rows = supabase_get(
            "mithron_products?select=slug&workflow_status=eq.published&is_visible=eq.true&order=sort_order.asc&limit=500"
        )
        slugs = [r["slug"] for r in rows]
    return slugs[:limit] if limit > 0 else slugs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", default=DEMO_SLUG)
    parser.add_argument("--batch", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--upload", action="store_true")
    parser.add_argument("--model", default="bria-rmbg", choices=["bria-rmbg", "isnet-general-use"])
    args = parser.parse_args()

    STAGING.mkdir(parents=True, exist_ok=True)
    print(json.dumps({"gpu_setup": preload_cuda_dlls()}, indent=2))

    if args.batch:
        slugs = list_product_slugs(args.limit)
        master = []
        for slug in slugs:
            print(f"\n=== {slug} ===")
            try:
                report = process_product(slug, rembg_model=args.model, upload=args.upload)
            except Exception as exc:  # noqa: BLE001
                report = {"slug": slug, "verdict": "LOSS", "error": str(exc)}
            master.append(
                {
                    "slug": report.get("slug"),
                    "verdict": report.get("verdict"),
                    "wins": report.get("wins"),
                    "losses": report.get("losses"),
                    "error": report.get("error"),
                }
            )
            (STAGING / "win-loss-report.json").write_text(json.dumps(master, indent=2), encoding="utf-8")
        print(json.dumps(master, indent=2))
        return

    report = process_product(args.slug, rembg_model=args.model, upload=args.upload)
    summary = {k: report[k] for k in report if k != "frames"}
    print(json.dumps(summary, indent=2))
    print(f"Frames: {len(report.get('frames', []))} → {report.get('verdict')}")
    print(f"Report: {STAGING / args.slug / 'report.json'}")


if __name__ == "__main__":
    main()
