import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def lookup_phases(formula: str) -> list[dict[str, Any]]:
    """
    Query Materials Project for phases matching `formula`.
    Returns up to 10 results with stability data.
    Requires MP_API_KEY env var.
    """
    api_key = os.getenv("MP_API_KEY", "").strip()
    if not api_key:
        logger.warning("MP_API_KEY not set; returning empty materials list")
        return []

    try:
        from mp_api.client import MPRester

        with MPRester(api_key) as mpr:
            docs = mpr.materials.summary.search(
                formula=formula,
                fields=[
                    "material_id",
                    "formula_pretty",
                    "formation_energy_per_atom",
                    "energy_above_hull",
                    "symmetry",
                    "is_stable",
                ],
            )

        results = []
        for d in docs[:10]:
            spacegroup = None
            if d.symmetry:
                spacegroup = getattr(d.symmetry, "symbol", None)
            results.append(
                {
                    "material_id": str(d.material_id),
                    "formula": d.formula_pretty,
                    "formation_energy_per_atom": round(float(d.formation_energy_per_atom or 0), 4),
                    "energy_above_hull": round(float(d.energy_above_hull or 0), 4),
                    "spacegroup": spacegroup,
                    "is_stable": bool(d.is_stable),
                }
            )
        return results

    except ImportError:
        logger.error("mp-api package not installed. Run: pip install mp-api")
        return []
    except Exception as exc:
        logger.error("Materials Project lookup failed: %s", exc)
        return []
