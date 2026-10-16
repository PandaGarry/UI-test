#!/usr/bin/env python3
"""
Step 1 of the real-Earth pipeline: Natural Earth raster -> per-tile kinds and elevation (raw bytes).

Source: Natural Earth "Gray Earth with Shaded Relief and Water" (GRAY_50M_SR_W, public domain),
10800x5400 equirectangular. Water is flat grey 106; on land grey grows with elevation.

Output, per map, into build/earth/ (not committed):
  <Name>.kinds.bin  one byte per tile: 0 water, 1 land        (row-major, y*W + x)
  <Name>.elev.bin   one byte per tile: elevation magnitude 0-30 for land (0 for water)
  <Name>.meta.json  size, crop and source share, used by import-earth.ts

Land rule (same as the current build, scripts/maps/build-terrain-maps.py): a target tile is land when at least
half of its source pixels are land. Elevation is the mean land grey of the tile, mapped to the foundation scale
so the class thresholds stay at the grey values used by the current game (hills from 180, mountains from 200):
  grey <  180 : plains    magnitude 0-9   (linear over 140..180)
  180 <= grey < 200 : hills    magnitude 10-19 (linear over 180..200)
  grey >= 200 : mountains magnitude 20-30 (1 per 2 grey above 200)

Usage: python3 export-earth.py <GRAY_50M_SR_W.tif> [Name ...]
Requires numpy and Pillow.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

WATER_GREY = 106
PLAINS_FROM, HILLS_FROM, MOUNTAINS_FROM = 140, 180, 200

# Target grids and crops come from scripts/maps/regions.json (single source of truth; add a region there).
import json as _json
from pathlib import Path as _Path

_REGIONS = _json.loads((_Path(__file__).parent / "regions.json").read_text(encoding="utf-8"))["regions"]
MAPS = {
    name: {"W": r["W"], "H": r["H"], "lon0": r["crop"]["lon0"], "lon1": r["crop"]["lon1"],
           "lat0": r["crop"]["lat0"], "lat1": r["crop"]["lat1"]}
    for name, r in _REGIONS.items()
}


def grey_to_magnitude(grey: np.ndarray) -> np.ndarray:
    """Mean land grey (float) -> magnitude 0-30 (int), piecewise as in the module docstring."""
    g = grey.astype(np.float64)
    m = np.zeros_like(g)
    p = g < HILLS_FROM
    m[p] = np.clip(np.floor((g[p] - PLAINS_FROM) / (HILLS_FROM - PLAINS_FROM) * 10.0), 0, 9)
    h = (g >= HILLS_FROM) & (g < MOUNTAINS_FROM)
    m[h] = 10 + np.clip(np.floor((g[h] - HILLS_FROM) / (MOUNTAINS_FROM - HILLS_FROM) * 10.0), 0, 9)
    t = g >= MOUNTAINS_FROM
    m[t] = 20 + np.clip(np.floor((g[t] - MOUNTAINS_FROM) / 2.0), 0, 10)
    return m.astype(np.uint8)


def export(grey_full: np.ndarray, name: str, p: dict, out_dir: Path) -> None:
    src_h, src_w = grey_full.shape
    x0 = round((p["lon0"] + 180) / 360 * src_w)
    x1 = round((p["lon1"] + 180) / 360 * src_w)
    y0 = round((90 - p["lat1"]) / 180 * src_h)
    y1 = round((90 - p["lat0"]) / 180 * src_h)
    crop = grey_full[y0:y1, x0:x1].astype(np.float32)
    land = (crop != WATER_GREY).astype(np.float32)
    W, H = p["W"], p["H"]
    land_share = np.array(Image.fromarray(land, mode="F").resize((W, H), Image.BOX))
    grey_sum = np.array(Image.fromarray(crop * land, mode="F").resize((W, H), Image.BOX))
    mean_grey = grey_sum / np.maximum(land_share, 1e-6)

    is_land = land_share >= 0.5
    kinds = is_land.astype(np.uint8)
    elev = np.where(is_land, grey_to_magnitude(mean_grey), 0).astype(np.uint8)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{name}.kinds.bin").write_bytes(kinds.tobytes())
    (out_dir / f"{name}.elev.bin").write_bytes(elev.tobytes())
    meta = {
        "name": name, "width": W, "height": H,
        "source": "Natural Earth GRAY_50M_SR_W (public domain)",
        "crop": {"lon0": p["lon0"], "lon1": p["lon1"], "lat0": p["lat0"], "lat1": p["lat1"]},
        "landShare": float(is_land.mean()),
    }
    (out_dir / f"{name}.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"{name} {W}x{H} land {meta['landShare']:.4f}")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: export-earth.py <GRAY_50M_SR_W.tif> [Name ...]")
    grey = np.array(Image.open(sys.argv[1]).convert("L"))
    names = sys.argv[2:] or list(MAPS)
    out_dir = Path(__file__).resolve().parents[2] / "build" / "earth"
    for name in names:
        export(grey, name, MAPS[name], out_dir)


if __name__ == "__main__":
    main()
