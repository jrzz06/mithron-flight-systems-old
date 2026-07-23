"""Force GPU-first ONNX Runtime (CUDA) before any rembg/session work."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def preload_cuda_dlls() -> dict:
    """Install/preload CUDA 12 + cuDNN DLLs for onnxruntime-gpu."""
    report: dict = {"preload": False, "providers": [], "cublas_found": False, "notes": []}

    # Prefer pip-installed NVIDIA wheel libs on PATH
    try:
        import site

        candidates: list[Path] = []
        for sp in site.getsitepackages():
            root = Path(sp)
            for pattern in (
                "nvidia/cublas/bin",
                "nvidia/cudnn/bin",
                "nvidia/cuda_runtime/bin",
                "nvidia/cuda_nvrtc/bin",
                "nvidia/cufft/bin",
                "nvidia/curand/bin",
            ):
                p = root / pattern
                if p.is_dir():
                    candidates.append(p)
                    os.environ["PATH"] = str(p) + os.pathsep + os.environ.get("PATH", "")

        for sp in site.getsitepackages():
            hits = list(Path(sp).rglob("cublas64_12.dll"))
            if hits:
                report["cublas_found"] = True
                report["cublas_path"] = str(hits[0])
                break
    except Exception as exc:  # noqa: BLE001
        report["notes"].append(f"site scan failed: {exc}")

    try:
        import onnxruntime as ort

        if hasattr(ort, "preload_dlls"):
            try:
                ort.preload_dlls()
                report["preload"] = True
            except Exception as exc:  # noqa: BLE001
                report["notes"].append(f"preload_dlls: {exc}")
        report["providers"] = list(ort.get_available_providers())
        report["ort_version"] = ort.__version__
    except Exception as exc:  # noqa: BLE001
        report["notes"].append(f"ort import failed: {exc}")

    # Prefer CUDA over CPU for rembg sessions
    os.environ.setdefault("ORT_TENSORRT_UNAVAILABLE", "1")
    if "CUDAExecutionProvider" in report.get("providers", []):
        report["gpu_preferred"] = True
    else:
        report["gpu_preferred"] = False
        report["notes"].append("CUDAExecutionProvider not listed — rembg may use CPU")

    return report


def prefer_gpu_session_kwargs() -> dict:
    """Session kwargs hint for rembg/onnx — GPU first."""
    return {
        "providers": ["CUDAExecutionProvider", "CPUExecutionProvider"],
    }


if __name__ == "__main__":
    info = preload_cuda_dlls()
    print(info)
    sys.exit(0 if info.get("cublas_found") or info.get("preload") else 1)
