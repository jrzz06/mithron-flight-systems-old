#!/usr/bin/env python3
"""Batch-enhance storefront source masters with Real-ESRGAN ncnn-vulkan (native 4x + Lanczos cap)."""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ENHANCED_MARKER_SUFFIX = ".enhanced.json"
ENGINE_NAME = "realesrgan-x4-native"
NATIVE_SCALE = 4
TILE_SIZE = 0  # auto — explicit small tiles caused VRAM stitch seams on large 4x outputs
MODEL_NAME = "realesrgan-x4plus"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enhance storefront image masters with Real-ESRGAN x4 native + Lanczos cap."
    )
    parser.add_argument("--manifest", required=True, help="JSON manifest path (items with src, maxEdge).")
    parser.add_argument("--project-root", required=True, help="Project root directory.")
    parser.add_argument("--binary-path", required=True, help="Path to realesrgan-ncnn-vulkan executable.")
    parser.add_argument("--dry-run", action="store_true", help="Report actions without writing files.")
    parser.add_argument("--force", action="store_true", help="Re-enhance even if marker exists.")
    parser.add_argument("--only", help="Process a single public src path.")
    return parser.parse_args()


def load_validator():
    tools_dir = Path(__file__).resolve().parent
    spec = importlib.util.spec_from_file_location(
        "validate_enhanced_images",
        tools_dir / "validate-enhanced-images.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load validate-enhanced-images.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def marker_path_for(source_path: Path) -> Path:
    return source_path.with_suffix(source_path.suffix + ENHANCED_MARKER_SUFFIX)


def read_marker(source_path: Path) -> dict | None:
    marker = marker_path_for(source_path)
    if not marker.exists():
        return None
    try:
        return json.loads(marker.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def write_marker(source_path: Path, payload: dict) -> None:
    marker_path_for(source_path).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def backup_source(source_path: Path) -> Path:
    backup_path = source_path.with_suffix(source_path.suffix + ".bak")
    if not backup_path.exists():
        shutil.copy2(source_path, backup_path)
    return backup_path


def restore_from_backup(source_path: Path) -> bool:
    backup_path = source_path.with_suffix(source_path.suffix + ".bak")
    if not backup_path.exists():
        return False
    shutil.copy2(backup_path, source_path)
    marker = marker_path_for(source_path)
    if marker.exists():
        marker.unlink()
    return True


def cap_image_size(image: Image.Image, max_edge: int) -> Image.Image:
    width, height = image.size
    longest = max(width, height)
    if longest <= max_edge:
        return image
    scale = max_edge / longest
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def save_image(image: Image.Image, destination: Path) -> None:
    suffix = destination.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        image.convert("RGB").save(destination, format="JPEG", quality=95, optimize=True)
        return
    if suffix == ".webp":
        image.save(destination, format="WEBP", quality=96, method=6)
        return
    image.save(destination, format="PNG", compress_level=6)


def run_realesrgan_binary(
    binary_path: Path,
    input_path: Path,
    output_path: Path,
    *,
    scale: int = NATIVE_SCALE,
    model: str = MODEL_NAME,
    tile_size: int = TILE_SIZE,
) -> None:
    models_dir = binary_path.parent / "models"
    command = [
        str(binary_path),
        "-i",
        str(input_path),
        "-o",
        str(output_path),
        "-n",
        model,
        "-s",
        str(scale),
        "-f",
        "png",
    ]
    if tile_size > 0:
        command.extend(["-t", str(tile_size)])
    if models_dir.exists():
        command.extend(["-m", str(models_dir)])

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"Real-ESRGAN failed for {input_path.name}: {detail}")


def validate_enhanced_output(image_path: Path, reference_path: Path | None = None) -> None:
    validator = load_validator()
    reference = reference_path if reference_path and reference_path.exists() else None
    result = validator.validate_image(image_path, validator.DEFAULT_TILE_SIZES, reference)
    if result["passed"]:
        return
    raise RuntimeError(
        f"Artifact validation failed for {image_path.name}: "
        f"seamScore={result['seamScore']} issues={result['issues'][:5]}"
    )


def enhance_item(
    item: dict,
    binary_path: Path,
    dry_run: bool,
    force: bool,
) -> dict:
    src = item["src"]
    max_edge = int(item.get("maxEdge", 2560))
    resolved = item.get("resolvedPath")
    if not resolved:
        return {"src": src, "status": "missing", "reason": "resolvedPath not provided"}

    source_path = Path(resolved)
    if not source_path.exists():
        return {"src": src, "status": "missing", "reason": f"file not found: {source_path}"}

    if force:
        restore_from_backup(source_path)

    if not force:
        marker = read_marker(source_path)
        if marker and marker.get("engine") == ENGINE_NAME:
            return {
                "src": src,
                "status": "skipped",
                "reason": "already enhanced",
                "marker": marker,
            }

    with Image.open(source_path) as image:
        image.load()
        width, height = image.size

    if dry_run:
        return {
            "src": src,
            "status": "dry-run",
            "engine": ENGINE_NAME,
            "nativeScale": NATIVE_SCALE,
            "inputWidth": width,
            "inputHeight": height,
            "maxEdge": max_edge,
            "resolvedPath": str(source_path),
        }

    backup_path = backup_source(source_path)

    try:
        with tempfile.TemporaryDirectory(prefix="mithron-esrgan-") as temp_dir:
            temp_dir_path = Path(temp_dir)
            input_png = temp_dir_path / "input.png"
            output_png = temp_dir_path / "output.png"
            capped_png = temp_dir_path / "capped.png"

            with Image.open(source_path) as image:
                image.convert("RGB").save(input_png, format="PNG")

            run_realesrgan_binary(binary_path, input_png, output_png)

            with Image.open(output_png) as enhanced:
                enhanced.load()
                capped = cap_image_size(enhanced, max_edge)
                capped.save(capped_png, format="PNG")

            validate_enhanced_output(capped_png, backup_path)
            save_image(capped, source_path)
            output_width, output_height = capped.size
    except RuntimeError as error:
        if "Artifact validation failed" not in str(error):
            raise
        restore_from_backup(source_path)
        return {
            "src": src,
            "status": "rejected",
            "reason": str(error),
            "engine": ENGINE_NAME,
            "resolvedPath": str(source_path),
        }

    result = {
        "src": src,
        "status": "enhanced",
        "engine": ENGINE_NAME,
        "nativeScale": NATIVE_SCALE,
        "backupPath": str(backup_path),
        "inputWidth": width,
        "inputHeight": height,
        "outputWidth": output_width,
        "outputHeight": output_height,
        "maxEdge": max_edge,
        "resolvedPath": str(source_path),
    }
    write_marker(source_path, result)
    return result


def main() -> int:
    args = parse_args()
    manifest_path = Path(args.manifest).resolve()
    manifest = load_manifest(manifest_path)
    items = manifest.get("items", [])

    if args.only:
        items = [item for item in items if item.get("src") == args.only]
        if not items:
            print(f"No manifest item matches --only {args.only}", file=sys.stderr)
            return 1

    binary_path = Path(args.binary_path).resolve()
    if not args.dry_run and not binary_path.exists():
        print(f"Real-ESRGAN binary not found: {binary_path}", file=sys.stderr)
        return 1

    if args.dry_run:
        print("Dry-run mode: Real-ESRGAN binary will not be invoked.")

    results = [
        enhance_item(item, binary_path, args.dry_run, args.force)
        for item in items
    ]

    summary = {
        "dryRun": args.dry_run,
        "engine": ENGINE_NAME,
        "nativeScale": NATIVE_SCALE,
        "processed": len(results),
        "enhanced": sum(1 for result in results if result["status"] == "enhanced"),
        "rejected": sum(1 for result in results if result["status"] == "rejected"),
        "skipped": sum(1 for result in results if result["status"] == "skipped"),
        "missing": sum(1 for result in results if result["status"] == "missing"),
        "dryRunCount": sum(1 for result in results if result["status"] == "dry-run"),
        "results": results,
    }

    out_path = manifest_path.with_suffix(".results.json")
    out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0 if summary["missing"] == 0 or args.dry_run else 2


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    raise SystemExit(main())
