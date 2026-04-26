"""
Grain segmentation — marker-controlled gradient watershed.

Pipeline (matches MATLAB GrainSizeAnalyzer2.m):
1. Sample masking      — isolate polished metal from epoxy mount
2. Bilateral + CLAHE   — denoise while preserving edges, normalise contrast
3. Sobel gradient      — terrain image: high at grain boundaries, low inside
4. Auto-seeds          — h_maxima on normalised distance transform (MATLAB imextendedmax)
   OR user-placed seeds
5. Watershed from seeds— floods outward from each seed, stops at gradient ridges
   (equivalent to MATLAB watershed(imimposemin(gradient, seeds)))
"""
import base64
import logging
import math
import pickle
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from scipy.ndimage import distance_transform_edt
from skimage.morphology import h_maxima
from skimage.segmentation import watershed as ski_watershed

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

_MODEL_PATH = Path(__file__).with_name("grain_rf_model.pkl")
log = logging.getLogger(__name__)


# ── ASTM E112 ─────────────────────────────────────────────────────────────────

def astm_grain_number(avg_diameter_microns: float) -> float:
    if avg_diameter_microns <= 0:
        return 0.0
    N_A = 40_000.0 / (math.pi * avg_diameter_microns ** 2)
    return round(1.0 + math.log2(N_A), 2)


# ── STAGE 1: SAMPLE MASK ──────────────────────────────────────────────────────

def _detect_sample_mask(gray: np.ndarray) -> np.ndarray:
    """Separate polished metal (bright) from epoxy mount (dark). Returns 255/0 mask."""
    h, w = gray.shape
    bw = max(5, min(h, w) // 20)
    border = np.concatenate([
        gray[:bw, :].ravel(), gray[-bw:, :].ravel(),
        gray[:, :bw].ravel(), gray[:, -bw:].ravel(),
    ])
    interior = gray[bw:-bw, bw:-bw].ravel()
    if float(np.mean(interior)) - float(np.mean(border)) <= 25:
        return np.ones_like(gray, dtype=np.uint8) * 255

    _, rough = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(rough, connectivity=8)
    if n <= 1:
        return np.ones_like(gray, dtype=np.uint8) * 255

    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    mask = (labels == largest).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=4)


# ── STAGE 2+3: DENOISE + ENHANCE ─────────────────────────────────────────────

def _prepare(gray: np.ndarray, clahe_clip: float) -> np.ndarray:
    denoised = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)
    return cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(8, 8)).apply(denoised)


# ── STAGE 3: GRADIENT TERRAIN ─────────────────────────────────────────────────

def _gradient_terrain(enhanced: np.ndarray) -> np.ndarray:
    """
    Sobel gradient magnitude, smoothed to reduce intra-grain texture noise.
    High values at grain boundaries, low inside grain interiors.
    """
    f32 = enhanced.astype(np.float32)
    # Pre-smooth to suppress fine texture within grains
    smooth = cv2.GaussianBlur(f32, (0, 0), 2.0)
    gx = cv2.Sobel(smooth, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(smooth, cv2.CV_32F, 0, 1, ksize=3)
    grad = np.sqrt(gx * gx + gy * gy)
    # Light Gaussian post-smooth to fill narrow gaps in boundaries
    return cv2.GaussianBlur(grad, (0, 0), 1.0)


# ── STAGE 4: AUTO-SEED GENERATION (h_maxima) ─────────────────────────────────

def generate_auto_seeds(
    image: np.ndarray,
    sensitivity: int = 50,
    clahe_clip: float = 2.0,
) -> list[dict]:
    """
    MATLAB-equivalent: imgaussfilt → imbinarize('adaptive') → bwdist → imextendedmax.

    sensitivity 1–99:
      low  → h_val close to 1 → only the most prominent peaks (fewer seeds)
      high → h_val close to 0 → many peaks, one per small grain (more seeds)
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    h, w = gray.shape

    sample_mask = _detect_sample_mask(gray)

    # Step 1: smooth (sigma=4) — matches MATLAB imgaussfilt(I, 4)
    smoothed = cv2.GaussianBlur(gray, (0, 0), 4.0)

    # Step 2: adaptive threshold — matches MATLAB imbinarize('adaptive')
    block = max(3, (min(h, w) // 10) | 1)
    bw = cv2.adaptiveThreshold(
        smoothed, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY,
        block, 2,
    )
    bw[sample_mask == 0] = 0

    # Step 3: remove small blobs (bwareaopen(bw, 20))
    n_cc, cc_labels, cc_stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    for i in range(1, n_cc):
        if cc_stats[i, cv2.CC_STAT_AREA] < 20:
            bw[cc_labels == i] = 0

    # Step 4: distance transform → normalise
    dist = distance_transform_edt(bw > 0).astype(np.float64)
    d_max = float(dist.max())
    if d_max < 1e-10:
        return _fallback_seeds(gray, sample_mask, sensitivity)

    norm_dist = dist / d_max

    # Step 5: h_maxima — matches MATLAB imextendedmax(normD, h)
    h_val = float(np.clip(1.0 - sensitivity / 100.0, 0.02, 0.95))
    try:
        peaks = h_maxima(norm_dist, h_val)
    except Exception as exc:
        log.warning("h_maxima failed (%s); falling back", exc)
        return _fallback_seeds(gray, sample_mask, sensitivity)

    peaks = peaks & (sample_mask > 0)
    if not peaks.any():
        return _fallback_seeds(gray, sample_mask, sensitivity)

    # Centroid of each connected peak region
    n_pk, _, _, centroids = cv2.connectedComponentsWithStats(
        peaks.astype(np.uint8) * 255, connectivity=8
    )
    return [
        {"x": round(float(centroids[i][0]) / w, 4),
         "y": round(float(centroids[i][1]) / h, 4)}
        for i in range(1, n_pk)
    ]


def _fallback_seeds(
    gray: np.ndarray,
    sample_mask: np.ndarray,
    sensitivity: int,
) -> list[dict]:
    """
    Simple peak_local_max fallback when h_maxima fails or dist transform is empty.
    Used for very uniform or low-contrast images.
    """
    from skimage.feature import peak_local_max
    h, w = gray.shape
    enhanced = _prepare(gray, 2.0)
    interior = sample_mask > 0
    dist = distance_transform_edt(interior).astype(np.float32)
    valid = dist[interior & (dist > 0)]
    if len(valid) < 10:
        return []
    grain_r = float(np.percentile(valid, 85))
    scale = max(0.3, min(3.0, sensitivity / 33.0))
    min_dist = max(5, int(grain_r / scale))
    peaks = peak_local_max(dist, min_distance=min_dist, labels=interior)
    return [
        {"x": round(float(x) / w, 4), "y": round(float(y) / h, 4)}
        for y, x in peaks
    ]


# ── STAGE 5: WATERSHED FROM SEEDS ────────────────────────────────────────────

def segment_from_seeds(
    image: np.ndarray,
    seeds: list[dict],
    clahe_clip: float = 2.0,
    min_grain_px: int = 100,
) -> dict[str, Any]:
    """
    MATLAB-equivalent: watershed(imimposemin(GradientImage, markerMask)).

    Floods from each seed outward; stops where the Sobel gradient is high
    (grain boundaries). Seeds must be placed in grain interiors.
    Returns ContourData dict including 'seeds' field (normalised coords).
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    h, w = gray.shape

    sample_mask = _detect_sample_mask(gray)
    enhanced = _prepare(gray, clahe_clip)
    gradient = _gradient_terrain(enhanced)

    # Build integer marker image
    markers = np.zeros((h, w), dtype=np.int32)
    markers[sample_mask == 0] = 1           # label 1 = background / mount

    valid_seeds: list[dict] = []
    for i, seed in enumerate(seeds, start=2):
        sx = int(round(float(seed["x"]) * w))
        sy = int(round(float(seed["y"]) * h))
        sx = max(0, min(w - 1, sx))
        sy = max(0, min(h - 1, sy))
        if sample_mask[sy, sx] > 0:
            # 3×3 blob for robustness
            markers[max(0, sy - 1):min(h, sy + 2), max(0, sx - 1):min(w, sx + 2)] = i
            valid_seeds.append({"x": float(seed["x"]), "y": float(seed["y"])})

    if not valid_seeds:
        _, buf = cv2.imencode(".png", cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR))
        return {
            "overlay_base64": base64.b64encode(buf.tobytes()).decode("ascii"),
            "grain_count": 0,
            "average_area_px": 0.0,
            "average_diameter_px": 0.0,
            "contours": [],
            "seeds": [],
        }

    # Watershed: floods from markers uphill through gradient terrain
    watershed_mask = (sample_mask > 0) | (markers == 1)
    labels: np.ndarray = ski_watershed(gradient, markers, mask=watershed_mask).astype(np.int32)

    # ── Colour overlay ────────────────────────────────────────────────────────
    vis = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    vis[sample_mask == 0] = [20, 10, 10]

    rng = np.random.default_rng(42)
    grain_labels = [int(l) for l in np.unique(labels) if l > 1]
    contours_out: list[dict] = []

    for label in grain_labels:
        px = labels == label
        area = int(np.sum(px))
        if area < min_grain_px:
            continue
        if float(np.sum(px & (sample_mask > 0))) / area < 0.75:
            continue
        hue = int(rng.integers(0, 180))
        color = np.array(
            cv2.cvtColor(np.uint8([[[hue, 100, 170]]]), cv2.COLOR_HSV2BGR)[0][0],
            dtype=np.int32,
        )
        vis[px] = np.clip(
            vis[px].astype(np.int32) * 80 // 100 + color * 20 // 100, 0, 255
        ).astype(np.uint8)
        m_ = cv2.moments(px.astype(np.uint8))
        cx = int(m_["m10"] / m_["m00"]) if m_["m00"] > 0 else 0
        cy = int(m_["m01"] / m_["m00"]) if m_["m00"] > 0 else 0
        contours_out.append({"id": label, "area_px": area, "centroid": [cx, cy]})

    # Grain boundary lines (neon green at label transitions)
    boundary = np.zeros((h, w), dtype=bool)
    boundary[:-1, :] |= labels[:-1, :] != labels[1:, :]
    boundary[1:, :]  |= labels[:-1, :] != labels[1:, :]
    boundary[:, :-1] |= labels[:, :-1] != labels[:, 1:]
    boundary[:, 1:]  |= labels[:, :-1] != labels[:, 1:]
    vis[boundary & (sample_mask > 0)] = [100, 255, 60]

    # Seed dots: red filled, white outline
    for seed in valid_seeds:
        sx = int(round(seed["x"] * w))
        sy = int(round(seed["y"] * h))
        cv2.circle(vis, (sx, sy), 5, (0, 0, 220), -1)
        cv2.circle(vis, (sx, sy), 6, (255, 255, 255), 1)

    # ── Stats ─────────────────────────────────────────────────────────────────
    grain_count = len(contours_out)
    avg_area = float(np.mean([c["area_px"] for c in contours_out])) if contours_out else 0.0
    avg_diam  = float(math.sqrt(4 * avg_area / math.pi)) if avg_area > 0 else 0.0

    _, buf = cv2.imencode(".png", vis)
    return {
        "overlay_base64": base64.b64encode(buf.tobytes()).decode("ascii"),
        "grain_count": grain_count,
        "average_area_px": round(avg_area, 2),
        "average_diameter_px": round(avg_diam, 2),
        "contours": contours_out[:300],
        "seeds": valid_seeds,
    }


# ── PUBLIC API (wraps auto-seed + watershed) ──────────────────────────────────

def segment_grains(
    image: np.ndarray,
    sensitivity: float = 1.0,    # kept for backward compat — maps to seed_sensitivity
    min_grain_px: int = 100,
    clahe_clip: float = 2.0,
    use_ml: bool = False,         # unused in new pipeline; kept to avoid breaking callers
    seed_sensitivity: int = 50,
    seeds: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Full grain segmentation. If seeds=None, generates them automatically.
    seed_sensitivity 1–99: higher = more seeds (finer grains detected).
    """
    if seeds is None:
        seeds = generate_auto_seeds(image, sensitivity=seed_sensitivity, clahe_clip=clahe_clip)
    return segment_from_seeds(image, seeds, clahe_clip=clahe_clip, min_grain_px=min_grain_px)


# ── ONE-SHOT RF (kept for annotation-based calibration) ──────────────────────

def _pixel_features(gray: np.ndarray) -> np.ndarray:
    f32 = gray.astype(np.float32)
    feats: list[np.ndarray] = []
    for s in (1, 2, 4):
        feats.append(cv2.GaussianBlur(f32, (0, 0), float(s)))
    gx = cv2.Sobel(f32, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(f32, cv2.CV_32F, 0, 1, ksize=3)
    feats += [np.sqrt(gx ** 2 + gy ** 2), np.arctan2(gy, gx)]
    feats.append(cv2.Laplacian(f32, cv2.CV_32F, ksize=3))
    mean_ = cv2.GaussianBlur(f32, (7, 7), 0)
    sq_ = cv2.GaussianBlur(f32 ** 2, (7, 7), 0)
    feats.append(np.sqrt(np.maximum(0.0, sq_ - mean_ ** 2)))
    return np.stack(feats, axis=-1).reshape(-1, len(feats))


def calibrate_from_annotation(
    image: np.ndarray,
    x0: float, y0: float, x1: float, y1: float,
) -> dict[str, Any]:
    """
    Given a rectangle around ONE grain, estimate seed_sensitivity + min_grain_px
    calibrated for this image. No RF model trained (seed-based pipeline doesn't need it).
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    h, w = gray.shape

    px0 = max(0, int(min(x0, x1) * w))
    py0 = max(0, int(min(y0, y1) * h))
    px1 = min(w - 1, int(max(x0, x1) * w))
    py1 = min(h - 1, int(max(y0, y1) * h))

    if (px1 - px0) < 8 or (py1 - py0) < 8:
        raise ValueError("Annotation rectangle too small (< 8 px on either axis)")

    grain_area = max(1, (px1 - px0) * (py1 - py0))
    grain_diam_px = 2.0 * math.sqrt(grain_area / math.pi)

    # Calibrate seed_sensitivity so the annotated grain size produces ~1 seed per grain.
    # Larger grain → lower sensitivity (fewer peaks needed)
    total_px = h * w
    grain_fraction = grain_area / total_px
    # Heuristic: larger grains → fewer seeds needed → lower sensitivity
    seed_sens = int(np.clip(80 - grain_fraction * 3000, 10, 90))

    min_grain_px = max(10, int(grain_area * 0.08))

    return {
        "seed_sensitivity": seed_sens,
        "sensitivity": 1.0,          # legacy field
        "min_grain_px": min_grain_px,
        "clahe_clip": 2.5,
        "use_ml": False,
        "estimated_grain_diameter_px": round(grain_diam_px, 1),
    }
