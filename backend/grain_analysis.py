import base64
import math
from typing import Any

import cv2
import numpy as np


def astm_grain_number(avg_diameter_microns: float) -> float:
    """ASTM E112 grain number from mean circular diameter (μm)."""
    if avg_diameter_microns <= 0:
        return 0.0
    # N_A = grains per mm² at 100× = 40,000 / (π × d_μm²)
    N_A = 40_000.0 / (math.pi * avg_diameter_microns**2)
    return round(1.0 + math.log2(N_A), 2)


def segment_grains(image: np.ndarray) -> dict[str, Any]:
    """
    Watershed grain segmentation.
    Accepts BGR or grayscale ndarray.
    Returns overlay PNG (base64), grain_count, avg stats, and per-grain contours.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Otsu threshold — grain boundaries appear as dark edges
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)

    sure_bg = cv2.dilate(opening, kernel, iterations=3)
    dist = cv2.distanceTransform(opening, cv2.DIST_L2, 5)
    _, sure_fg = cv2.threshold(dist, 0.4 * dist.max(), 255, 0)
    sure_fg = sure_fg.astype(np.uint8)

    unknown = cv2.subtract(sure_bg, sure_fg)
    _, markers = cv2.connectedComponents(sure_fg)
    markers = markers + 1
    markers[unknown == 255] = 0

    bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    markers = cv2.watershed(bgr, markers)

    # Neon-green grain boundaries (#00ff88)
    overlay = bgr.copy()
    overlay[markers == -1] = [136, 255, 0]  # BGR

    grain_labels = [l for l in np.unique(markers) if l > 1 and l != -1]
    grain_count = len(grain_labels)

    contours: list[dict] = []
    for label in grain_labels[:300]:
        mask = (markers == label).astype(np.uint8)
        area = int(np.sum(mask))
        m = cv2.moments(mask)
        cx = int(m["m10"] / m["m00"]) if m["m00"] > 0 else 0
        cy = int(m["m01"] / m["m00"]) if m["m00"] > 0 else 0
        contours.append({"id": int(label), "area_px": area, "centroid": [cx, cy]})

    avg_area = float(np.mean([c["area_px"] for c in contours])) if contours else 0.0
    avg_diam_px = float(math.sqrt(4 * avg_area / math.pi)) if avg_area > 0 else 0.0

    _, png_buf = cv2.imencode(".png", overlay)
    overlay_b64 = base64.b64encode(png_buf.tobytes()).decode("ascii")

    return {
        "overlay_base64": overlay_b64,
        "grain_count": grain_count,
        "average_area_px": round(avg_area, 2),
        "average_diameter_px": round(avg_diam_px, 2),
        "contours": contours,
    }
