"""Background removal: skip / classical white / BRIA + edge cleanup."""

from __future__ import annotations

from collections import deque
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageFilter

from .classify import ImageClass
from .gpu_setup import preload_cuda_dlls

_SESSION = None
_SESSION_MODEL = None


def get_bria_session(model: str = "bria-rmbg"):
    global _SESSION, _SESSION_MODEL
    preload_cuda_dlls()
    if _SESSION is not None and _SESSION_MODEL == model:
        return _SESSION
    from rembg import new_session

    _SESSION = new_session(model)
    _SESSION_MODEL = model
    return _SESSION


def release_cutout_session() -> None:
    """Free rembg/ONNX GPU memory before loading Stable Diffusion."""
    global _SESSION, _SESSION_MODEL
    _SESSION = None
    _SESSION_MODEL = None
    import gc

    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass


def erode_alpha(alpha_u8: np.ndarray, radius: int = 1) -> np.ndarray:
    if radius <= 0:
        return alpha_u8
    size = radius * 2 + 1
    return np.array(
        Image.fromarray(alpha_u8, mode="L").filter(ImageFilter.MinFilter(size)),
        dtype=np.uint8,
    )


def remove_orphan_bg_blobs(rgba: np.ndarray, max_area_ratio: float = 0.02) -> np.ndarray:
    """Drop small disconnected opaque islands (leftover white floor/bg chunks)."""
    alpha = rgba[:, :, 3]
    h, w = alpha.shape
    mask = (alpha > 20).astype(np.uint8)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num <= 2:
        return rgba
    areas = stats[1:, cv2.CC_STAT_AREA]
    main_label = 1 + int(np.argmax(areas))
    max_orphan = int(h * w * max_area_ratio)
    out = rgba.copy()
    for i in range(1, num):
        if i == main_label:
            continue
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area <= max_orphan:
            out[labels == i, 3] = 0
    return out


def defringe_halo(image: Image.Image, strength: str = "strong") -> Image.Image:
    """
    Kill white fringe/halo from studio cutouts.
    - Unmix assumed white background from semi-transparent edge pixels
    - Erode alpha on bright fringe
    - Suppress leftover white bg blobs
    """
    rgba = np.array(image.convert("RGBA"), dtype=np.float32)
    rgba = remove_orphan_bg_blobs(rgba.astype(np.uint8)).astype(np.float32)

    rgb = rgba[:, :, :3]
    alpha_u8 = rgba[:, :, 3].astype(np.uint8)
    alpha = np.maximum(alpha_u8.astype(np.float32) / 255.0, 1.0 / 255.0)
    luma = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    sat = rgb.max(axis=2) - rgb.min(axis=2)

    # Broader fringe detection: any bright low-sat edge pixel with partial alpha
    if strength == "strong":
        fringe = (alpha_u8 > 0) & (
            ((alpha_u8 < 250) & (luma > 175) & (sat < 55))
            | ((alpha_u8 < 180) & (luma > 150))
            | ((alpha_u8 < 120) & (luma > 130))
        )
        erode_r = 2
        kill_luma = 210
    else:
        fringe = (alpha_u8 > 0) & (alpha_u8 < 220) & (luma > 200)
        erode_r = 1
        kill_luma = 230

    bg = np.array([255.0, 255.0, 255.0], dtype=np.float32)
    # Un-premultiply white studio spill
    fg = (rgb - (1.0 - alpha[..., None]) * bg) / alpha[..., None]
    fg = np.clip(fg, 0, 255)

    out_rgb = rgb.copy()
    out_a = alpha_u8.astype(np.float32)

    if np.any(fringe):
        out_rgb = np.where(fringe[..., None], fg, out_rgb)
        eroded = erode_alpha(alpha_u8, radius=erode_r).astype(np.float32)
        out_a = np.where(fringe, np.minimum(out_a, eroded * 0.85), out_a)

    # Hard-kill near-white pixels that are only weakly opaque (leftover bg)
    hard_kill = (out_a > 0) & (out_a < 200) & (out_rgb.mean(axis=2) > kill_luma) & (sat < 40)
    out_a = np.where(hard_kill, 0, out_a)

    # Second pass: shrink remaining bright fringe one more px
    luma2 = out_rgb.mean(axis=2)
    residual = (out_a > 0) & (out_a < 230) & (luma2 > 190) & (sat < 50)
    if np.any(residual):
        eroded2 = erode_alpha(out_a.astype(np.uint8), radius=1).astype(np.float32)
        out_a = np.where(residual, eroded2 * 0.7, out_a)
        # Pull fringe color toward darker neighbor estimate (avg of opaque nearby via blur)
        opaque = (out_a > 200).astype(np.float32)
        for c in range(3):
            blur = cv2.blur(out_rgb[:, :, c] * opaque, (5, 5))
            wsum = cv2.blur(opaque, (5, 5))
            neighbor = np.divide(blur, np.maximum(wsum, 1e-3))
            out_rgb[:, :, c] = np.where(residual, neighbor * 0.65 + out_rgb[:, :, c] * 0.35, out_rgb[:, :, c])

    out_a = np.clip(out_a, 0, 255)
    # Zero RGB where fully transparent (avoids white flash in some viewers)
    out_rgb = np.where(out_a[..., None] < 1, 0, out_rgb)

    result = np.dstack([out_rgb, out_a]).astype(np.uint8)
    result = remove_orphan_bg_blobs(result, max_area_ratio=0.03)
    return Image.fromarray(result, "RGBA")


def classical_white_cutout(image: Image.Image) -> Image.Image:
    """Flood-fill white/light studio background from borders (preserve WxH)."""
    rgba = np.array(image.convert("RGBA"), dtype=np.uint8)
    h, w = rgba.shape[:2]
    visited = np.zeros((h, w), dtype=np.uint8)
    is_bg = np.zeros((h, w), dtype=np.uint8)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= w or y >= h:
            return
        if visited[y, x]:
            return
        visited[y, x] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    def matches_bg(r: int, g: int, b: int) -> bool:
        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        sat = max(r, g, b) - min(r, g, b)
        if sat < 40 and luma > 190:
            return True
        if sat < 25 and 165 < luma < 210:
            return True
        if b > r + 8 and b > g + 4 and 150 < luma < 245 and 8 < sat < 80:
            return True
        return False

    while q:
        x, y = q.pop()
        r, g, b, _a = rgba[y, x]
        if not matches_bg(int(r), int(g), int(b)):
            continue
        is_bg[y, x] = 1
        push(x - 1, y)
        push(x + 1, y)
        push(x, y - 1)
        push(x, y + 1)

    # Also mark near-white interior pockets connected loosely via morphology
    near_white = np.zeros((h, w), dtype=np.uint8)
    for y in range(h):
        for x in range(w):
            r, g, b, _a = rgba[y, x]
            if matches_bg(int(r), int(g), int(b)):
                near_white[y, x] = 1
    # Grow flood bg into near-white via a few dilate+and passes (vectorized)
    bg = is_bg.copy()
    kernel = np.ones((3, 3), np.uint8)
    for _ in range(8):
        dil = cv2.dilate(bg, kernel, iterations=1)
        grown = ((dil > 0) & (near_white > 0)).astype(np.uint8)
        if np.array_equal(grown, bg):
            break
        bg = grown

    alpha = np.where(bg > 0, 0, 255).astype(np.uint8)
    # Slight blur then threshold to anti-alias without thick white fringe
    soft = cv2.GaussianBlur(alpha, (3, 3), 0)
    alpha = np.where(soft < 40, 0, soft).astype(np.uint8)
    out = rgba.copy()
    out[:, :, 3] = alpha
    return defringe_halo(Image.fromarray(out, "RGBA"), strength="strong")


def bria_cutout(
    image: Image.Image,
    model: str = "bria-rmbg",
    *,
    preserve_holes: bool = False,
    defringe: str = "strong",
) -> Image.Image:
    """
    rembg matte → RGBA.
    preserve_holes=True skips MORPH_CLOSE (needed for cage/mesh products).
    """
    from rembg import remove

    session = get_bria_session(model)
    cut = remove(image.convert("RGB"), session=session)
    if cut.size != image.size:
        cut = cut.resize(image.size, Image.Resampling.LANCZOS)
    cut = cut.convert("RGBA")
    arr = np.array(cut)
    if not preserve_holes:
        alpha = arr[:, :, 3]
        kernel = np.ones((3, 3), np.uint8)
        closed = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=1)
        arr[:, :, 3] = closed
    strength = defringe if defringe in ("strong", "soft") else "strong"
    return defringe_halo(Image.fromarray(arr, "RGBA"), strength=strength)


def cage_cutout(image: Image.Image, model: str = "birefnet-general-lite") -> Image.Image:
    """
    Hole-preserving cutout for cage/mesh/lattice products.
    BiRefNet lite on RTX 2050; no morph-close; soft defringe only.
    """
    return bria_cutout(
        image,
        model=model,
        preserve_holes=True,
        defringe="soft",
    )


def remove_background(image: Image.Image, label: ImageClass, model: str = "bria-rmbg") -> tuple[Image.Image, str]:
    """Return (rgba, method). Preserves original dimensions."""
    orig_size = image.size
    if label == "product_cutout_png":
        out = defringe_halo(image.convert("RGBA"))
        method = "skip_defringe"
    elif label == "product_photo_white":
        # Prefer BRIA for white studio — classical flood often leaves halo on soft shadows
        try:
            out = bria_cutout(image, model=model)
            method = f"bria:{model}"
            ok, issues = validate_alpha(out)
            if not ok:
                print(f"  BRIA alpha warnings {issues}; trying classical")
                classic = classical_white_cutout(image)
                ok2, _ = validate_alpha(classic)
                if ok2:
                    out, method = classic, "classical_white"
                else:
                    out = defringe_halo(out)
                    method = f"bria:{model}+defringe"
        except Exception as exc:  # noqa: BLE001
            print(f"  BRIA failed ({exc}); classical white")
            out = classical_white_cutout(image)
            method = "classical_white"
    elif label in ("product_photo_complex", "drone_photo"):
        out = bria_cutout(image, model=model)
        method = f"bria:{model}"
    else:
        # Spec / banner — no cutout
        out = image.convert("RGBA")
        method = "none"
    if out.size != orig_size:
        out = out.resize(orig_size, Image.Resampling.LANCZOS)
    return out, method


def validate_alpha(image: Image.Image) -> tuple[bool, list[str]]:
    """Reject holes, jagged edges, empty/near-empty, heavy halo."""
    issues: list[str] = []
    rgba = np.array(image.convert("RGBA"))
    alpha = rgba[:, :, 3]
    h, w = alpha.shape
    coverage = float(np.count_nonzero(alpha > 8) / alpha.size)
    if coverage < 0.02:
        issues.append("missing_product_nearly_empty")
    if coverage > 0.98:
        issues.append("background_not_removed")

    # Tiny holes inside opaque region
    opaque = (alpha > 200).astype(np.uint8) * 255
    if opaque.any():
        inv = cv2.bitwise_not(opaque)
        # holes = background components not touching border
        num, labels, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=8)
        for i in range(1, num):
            x, y, bw, bh, area = stats[i]
            touches = x <= 1 or y <= 1 or x + bw >= w - 2 or y + bh >= h - 2
            if not touches and 4 <= area <= (h * w * 0.01):
                issues.append(f"tiny_hole_area={area}")
                break

    # Jaggedness: high perimeter vs area
    semi = (alpha > 0) & (alpha < 220)
    luma = rgba[:, :, :3].astype(np.float32).mean(axis=2)
    halo = semi & (luma > 242) & (alpha < 180)
    halo_ratio = float(halo.sum()) / float(semi.sum()) if semi.any() else 0.0
    if halo_ratio > 0.55:
        issues.append(f"white_halo_ratio={halo_ratio:.3f}")

    edge = cv2.Canny(alpha, 50, 150)
    edge_ratio = float(edge.sum() / 255) / alpha.size
    if edge_ratio > 0.22:
        issues.append(f"jagged_edge_ratio={edge_ratio:.3f}")

    return len(issues) == 0, issues
