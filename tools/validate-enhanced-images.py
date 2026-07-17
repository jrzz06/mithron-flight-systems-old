#!/usr/bin/env python3
"""Detect tile seams and block-corruption artifacts in enhanced images."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

DEFAULT_TILE_SIZES = (256, 512, 1024)
SEAM_RATIO_THRESHOLD = 4.0
MIN_GRID_SEAM_HITS = 3
FROZEN_TILE_MIN_SIDE = 64
FROZEN_TILE_MAX_STD = 4.0
FROZEN_TILE_MIN_FRACTION = 0.08


def load_rgb_array(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.asarray(image.convert("RGB"), dtype=np.float32)


def row_gradient_energy(pixels: np.ndarray) -> np.ndarray:
    diffs = np.abs(np.diff(pixels, axis=1))
    return diffs.mean(axis=(1, 2))


def has_uniform_background(pixels: np.ndarray, threshold: float = 235.0, fraction: float = 0.35) -> bool:
    near_uniform = np.all(pixels >= threshold, axis=2)
    return float(near_uniform.mean()) >= fraction


def detect_seam_artifacts(pixels: np.ndarray, tile_sizes: tuple[int, ...]) -> tuple[bool, float, list[dict]]:
    height = pixels.shape[0]
    energy = row_gradient_energy(pixels)
    if height < 32:
        return False, 0.0, []

    baseline = float(np.median(energy))
    if baseline <= 0:
        baseline = 1e-6

    high_key = has_uniform_background(pixels)
    ratio_threshold = 12.0 if high_key else SEAM_RATIO_THRESHOLD
    min_grid_hits = 5 if high_key else MIN_GRID_SEAM_HITS
    severe_threshold = 50.0 if high_key else 6.0

    hits: list[dict] = []
    max_ratio = 0.0

    for tile in tile_sizes:
        for row in range(tile, height - 1, tile):
            local = energy[max(0, row - 8) : min(height, row + 8)]
            local_baseline = float(np.median(local)) if local.size else baseline
            ratio = float(energy[row] / max(local_baseline, 1e-6))
            max_ratio = max(max_ratio, ratio)
            if ratio >= ratio_threshold:
                hits.append({"type": "horizontal_seam", "row": row, "tileSize": tile, "ratio": round(ratio, 3)})

    for tile in tile_sizes:
        width = pixels.shape[1]
        col_energy = np.abs(np.diff(pixels, axis=0)).mean(axis=(0, 2))
        col_baseline = max(float(np.median(col_energy)), float(np.percentile(col_energy, 25)), 1e-6)
        for col in range(tile, width - 1, tile):
            ratio = float(col_energy[col] / col_baseline)
            max_ratio = max(max_ratio, ratio)
            if ratio >= ratio_threshold:
                hits.append({"type": "vertical_seam", "col": col, "tileSize": tile, "ratio": round(ratio, 3)})

    horizontal_hits = [hit for hit in hits if hit["type"] == "horizontal_seam"]
    vertical_hits = [hit for hit in hits if hit["type"] == "vertical_seam"]
    unique_rows = len({hit["row"] for hit in horizontal_hits})
    unique_cols = len({hit["col"] for hit in vertical_hits})
    grid_like = unique_rows >= min_grid_hits or unique_cols >= min_grid_hits
    severe = max_ratio >= severe_threshold
    return (grid_like or severe), max_ratio, hits


def detect_frozen_tiles(pixels: np.ndarray) -> tuple[bool, float, list[dict]]:
    height, width, _ = pixels.shape
    min_side = min(height, width)
    block = min(FROZEN_TILE_MIN_SIDE, max(32, min_side // 16))
    hits: list[dict] = []
    max_fraction = 0.0

    for y in range(0, height - block + 1, block):
        for x in range(0, width - block + 1, block):
            patch = pixels[y : y + block, x : x + block]
            std = float(patch.std())
            if std <= FROZEN_TILE_MAX_STD:
                fraction = (block * block) / (height * width)
                max_fraction = max(max_fraction, fraction)
                if fraction >= FROZEN_TILE_MIN_FRACTION:
                    hits.append(
                        {
                            "type": "frozen_tile",
                            "x": x,
                            "y": y,
                            "block": block,
                            "std": round(std, 3),
                        }
                    )

    return len(hits) > 0, max_fraction, hits


def validate_with_reference(enhanced_path: Path, reference_path: Path, tile_sizes: tuple[int, ...]) -> dict:
    """Reference is used for reporting; pass/fail uses raw grid + frozen-tile checks only."""
    del reference_path  # reserved for future differential metrics
    pixels = load_rgb_array(enhanced_path)
    seam_fail, seam_score, seam_hits = detect_seam_artifacts(pixels, tile_sizes)
    frozen_fail, frozen_score, frozen_hits = detect_frozen_tiles(pixels)
    passed = not seam_fail and not frozen_fail
    return {
        "path": str(enhanced_path),
        "passed": passed,
        "seamScore": round(seam_score, 3),
        "frozenTileFraction": round(frozen_score, 4),
        "issues": seam_hits + frozen_hits,
    }


def validate_image(path: Path, tile_sizes: tuple[int, ...], reference_path: Path | None = None) -> dict:
    if reference_path and reference_path.exists():
        return validate_with_reference(path, reference_path, tile_sizes)
    pixels = load_rgb_array(path)
    seam_fail, seam_score, seam_hits = detect_seam_artifacts(pixels, tile_sizes)
    frozen_fail, frozen_score, frozen_hits = detect_frozen_tiles(pixels)
    passed = not seam_fail and not frozen_fail
    return {
        "path": str(path),
        "passed": passed,
        "seamScore": round(seam_score, 3),
        "frozenTileFraction": round(frozen_score, 4),
        "issues": seam_hits + frozen_hits,
    }


def collect_paths(manifest: Path | None, directory: Path | None, explicit: list[Path]) -> list[Path]:
    paths: list[Path] = list(explicit)
    if manifest and manifest.exists():
        data = json.loads(manifest.read_text(encoding="utf-8"))
        for item in data.get("items", []):
            resolved = item.get("resolvedPath")
            if resolved:
                source = Path(resolved).resolve()
                marker = source.with_suffix(source.suffix + ".enhanced.json")
                if marker.exists():
                    paths.append(source)
    if directory and directory.exists():
        for ext in ("*.webp", "*.png", "*.jpg", "*.jpeg"):
            for path in directory.glob(ext):
                if path.suffix == ".bak" or path.name.endswith(".enhanced.json"):
                    continue
                paths.append(path)
    unique: dict[str, Path] = {}
    for path in paths:
        if path.exists() and path.is_file():
            unique[str(path.resolve())] = path.resolve()
    return list(unique.values())


def reference_path_for(source_path: Path) -> Path:
    return source_path.with_suffix(source_path.suffix + ".bak")


def build_manifest_reference_map(manifest: Path | None) -> dict[str, Path]:
    mapping: dict[str, Path] = {}
    if not manifest or not manifest.exists():
        return mapping
    data = json.loads(manifest.read_text(encoding="utf-8"))
    for item in data.get("items", []):
        resolved = item.get("resolvedPath")
        if not resolved:
            continue
        source = Path(resolved).resolve()
        marker = source.with_suffix(source.suffix + ".enhanced.json")
        if not marker.exists():
            continue
        mapping[str(source)] = reference_path_for(source)
    return mapping


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate enhanced images for tile/block artifacts.")
    parser.add_argument("--manifest", help="Enhancement manifest JSON path.")
    parser.add_argument("--directory", help="Directory of images to validate.")
    parser.add_argument("--image", action="append", default=[], help="Explicit image path (repeatable).")
    parser.add_argument("--output", help="Write JSON report to this path.")
    parser.add_argument("--tile-sizes", default="256,512,1024", help="Comma-separated tile sizes to probe.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest_path = Path(args.manifest).resolve() if args.manifest else None
    tile_sizes = tuple(int(value.strip()) for value in args.tile_sizes.split(",") if value.strip())
    paths = collect_paths(
        manifest_path,
        Path(args.directory).resolve() if args.directory else None,
        [Path(value).resolve() for value in args.image],
    )
    reference_map = build_manifest_reference_map(manifest_path)

    if not paths:
        print("No images to validate.", file=sys.stderr)
        return 1

    results = [
        validate_image(path, tile_sizes, reference_map.get(str(path.resolve())))
        for path in paths
    ]
    summary = {
        "validated": len(results),
        "passed": sum(1 for result in results if result["passed"]),
        "failed": sum(1 for result in results if not result["passed"]),
        "results": results,
    }

    if args.output:
        Path(args.output).write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(json.dumps(summary, indent=2))
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
