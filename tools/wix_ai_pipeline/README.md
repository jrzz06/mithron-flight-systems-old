# Dual-asset AI product image pipeline

GPU-first pipeline: retrieve → enhance → transparent cutout (A) → marketing hero (B).

## Locked storefront roles

- **Cutout A** → `primary` / product cards (`products/{slug}/ai-cutout/`)
- **Hero B** → PDP `hero` + gallery lead (`products/{slug}/ai-hero/`)
- Legacy `catalog-cutouts/v1` remains banned

## Environment (one-time)

```powershell
$py = "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
& $py -m pip install "numpy<2.5" "Pillow>=12.1,<13" "opencv-python-headless>=4.8" rembg
& $py -m pip install "onnxruntime-gpu[cuda,cudnn]" nvidia-cublas-cu12 nvidia-cuda-runtime-cu12 nvidia-cudnn-cu12 nvidia-cuda-nvrtc-cu12
# Optional generative hero (RTX 2050 — falls back to studio if missing/OOM):
& $py -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
& $py -m pip install "diffusers>=0.30" transformers accelerate safetensors
# Note: Python 3.13 often only has CPU torch wheels (cuda=false). The pipeline
# auto-degrades to studio-composite hero — it does not fail. Optional override:
#   $env:FORCE_SD_CPU="1"   # attempt CPU SD inpaint (slow)
```

Real-ESRGAN binary: `tools/realesrgan-bin/realesrgan-ncnn-vulkan.exe`

## Local demo (no upload)

```powershell
cd d:\mithuuu\mithuuu
$env:PYTHONUNBUFFERED="1"
& $py -u tools/wix_ai_pipeline/run_dual_assets.py --input path\to\image.png --hero-mode=generative --out tools/.wix-ai-pipeline/demo-local
```

## Cage / mesh cutout → enhance (same size, no upscale)

Hole-preserving BiRefNet lite + Real-ESRGAN clarity (RTX 2050). Skips morph-close so cage gaps stay transparent.

```powershell
& $py -u tools/wix_ai_pipeline/demo_cutout_enhance.py --input path\to\cage.png --mode cage --model birefnet-general-lite --out tools/.wix-ai-pipeline/demo-cage-cutout
```

Outputs: `01-cutout.png`, `02-enhanced-cutout.png`, checkerboard `*.preview.png`.

## Supabase slug run

```powershell
& $py -u tools/wix_ai_pipeline/run_dual_assets.py --slug source-10-liter-dual-agri-drone --hero-mode=generative
node tools/wix_ai_pipeline/upload_dual_assets.mjs --slug=source-10-liter-dual-agri-drone
node tools/wix_ai_pipeline/upload_dual_assets.mjs --slug=source-10-liter-dual-agri-drone --apply --confirm=UPLOAD_DUAL
```

## Outputs

Staging: `tools/.wix-ai-pipeline/{slug|demo-local}/`

- `02-cutout.png` / `export/cutout.webp`
- `03-hero.png` / `export/hero.webp`
- `report.json`

## Hard rules

Same product identity/pose, 1:1 square, BRIA cutout + Real-ESRGAN enhance, generative hero mask-locked with studio fallback.
When PyTorch CUDA is unavailable (e.g. Python 3.13 CPU-only torch), hero mode degrades to studio-composite and the run still completes.
