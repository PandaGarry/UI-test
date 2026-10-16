#!/usr/bin/env python3
"""
Builds Europe and World with land, water and three terrain classes
(plains, hills, mountains) from Natural Earth raster data (public domain).

Source: Natural Earth "Gray Earth with Shaded Relief and Water" (GRAY_50M_SR_W, 10800x5400, equirectangular).
Water is flat grey 106; on land the grey value grows with elevation (lowland ~146, Alps ~196,
Himalaya ~214). Terrain classes are thresholds on the land-only average grey value.

Get the source once (not stored in the repository):
  git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-raster.git
  cd natural-earth-raster && git sparse-checkout set 50m_rasters/GRAY_50M_SR_W
Then:
  python3 scripts/maps/build-terrain-maps.py <path/to/GRAY_50M_SR_W.tif>
  npm run gen-maps

Requires: numpy, Pillow.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

WATER_GREY = 106
HILL_FROM = 180       # land average grey >= this: hills
MOUNTAIN_FROM = 200   # land average grey >= this: mountains

# Tile types. colorBase/colorVariant select the colours of the active theme (resources/themes).
# expansionCost sets the terrain class used by combat (see terrainOf in AttackRules.ts): <70 plains, 70-79 hills, >=80 mountains.
TYPES = [
    {"name": "Water", "color": "#A4D9ED", "colorBase": "water", "colorVariant": 4, "conquerable": False, "navigable": True},
    {"name": "Plains", "color": "#E2E2B8", "colorBase": "grass", "colorVariant": 6, "conquerable": True, "navigable": False, "expansionCost": 50, "expansionTime": 50},
    {"name": "Hills", "color": "#D6D6B2", "colorBase": "grass", "colorVariant": 12, "conquerable": True, "navigable": False, "expansionCost": 75, "expansionTime": 50},
    {"name": "Mountains", "color": "#E2E2D0", "colorBase": "mountain", "colorVariant": 12, "conquerable": True, "navigable": False, "expansionCost": 85, "expansionTime": 50},
]

# lon0, lon1, lat0, lat1 and output size at the reference sizes (see docs/PARITY.md, section 1.5).
MAPS = {
    "Europe": {"W": 2904, "H": 1672, "lon0": -25, "lon1": 40, "lat0": 36, "lat1": 68},
    "World": {"W": 2000, "H": 1000, "lon0": -180, "lon1": 180, "lat0": -90, "lat1": 90},
}


def hex_to_rgb(h: str):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def build(grey: np.ndarray, name: str, p: dict, out_dir: Path) -> None:
    src_h, src_w = grey.shape
    x0 = round((p["lon0"] + 180) / 360 * src_w)
    x1 = round((p["lon1"] + 180) / 360 * src_w)
    y0 = round((90 - p["lat1"]) / 180 * src_h)
    y1 = round((90 - p["lat0"]) / 180 * src_h)
    crop = grey[y0:y1, x0:x1].astype(np.float32)
    land = (crop != WATER_GREY).astype(np.float32)
    # Box-filter onto the target grid: land share per tile, and land-only grey sum.
    land_share = np.array(Image.fromarray(land, mode="F").resize((p["W"], p["H"]), Image.BOX))
    grey_sum = np.array(Image.fromarray(crop * land, mode="F").resize((p["W"], p["H"]), Image.BOX))
    mean_grey = grey_sum / np.maximum(land_share, 1e-6)

    is_land = land_share >= 0.5
    terrain = np.zeros((p["H"], p["W"]), dtype=np.uint8)  # 0 water
    terrain[is_land] = 1
    terrain[is_land & (mean_grey >= HILL_FROM)] = 2
    terrain[is_land & (mean_grey >= MOUNTAIN_FROM)] = 3

    rgb = np.zeros((p["H"], p["W"], 3), dtype=np.uint8)
    for idx, t in enumerate(TYPES):
        rgb[terrain == idx] = hex_to_rgb(t["color"])
    Image.fromarray(rgb, mode="RGB").save(out_dir / f"{name}.png", optimize=True)
    (out_dir / f"{name}.json").write_text(json.dumps({"tiles": TYPES}, indent=2) + "\n")

    total = terrain.size
    counts = [int((terrain == i).sum()) for i in range(len(TYPES))]
    land_total = total - counts[0]
    print(f"{name} {p['W']}x{p['H']} land {land_total} "
          f"plains {counts[1] / land_total:.1%} hills {counts[2] / land_total:.1%} mountains {counts[3] / land_total:.1%}")


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: build-terrain-maps.py <GRAY_50M_SR_W.tif>")
    grey = np.array(Image.open(sys.argv[1]).convert("L"))
    out_dir = Path(__file__).resolve().parents[2] / "resources" / "maps"
    for name, p in MAPS.items():
        build(grey, name, p, out_dir)


if __name__ == "__main__":
    main()
