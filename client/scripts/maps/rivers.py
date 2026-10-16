"""
Visual river layer (R) from Natural Earth rivers (public domain). VISUAL ONLY: never read by the foundation (F).

Input : Natural Earth rivers_lake_centerlines GeoJSON (50m, matches the raster used for the regions).
Output: build/earth/<Name>.rivers.png, 8-bit grayscale, 255 = river cell, same grid as <Name>.F (W x H).
Grid and crop come from scripts/maps/regions.json (single source of truth).

Usage: rivers.py <rivers.geojson> [Name ...]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).parent
REGIONS = json.loads((HERE / "regions.json").read_text(encoding="utf-8"))["regions"]
OUT_DIR = Path("build/earth")


def draw_region(features, name: str, region: dict) -> int:
    W, H = region["W"], region["H"]
    c = region["crop"]
    lon0, lon1, lat0, lat1 = c["lon0"], c["lon1"], c["lat0"], c["lat1"]
    img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(img)

    def to_px(lon: float, lat: float):
        return ((lon - lon0) / (lon1 - lon0) * W, (lat1 - lat) / (lat1 - lat0) * H)

    lines = 0
    for f in features:
        geom = f.get("geometry") or {}
        if geom.get("type") == "LineString":
            parts = [geom["coordinates"]]
        elif geom.get("type") == "MultiLineString":
            parts = geom["coordinates"]
        else:
            continue
        for part in parts:
            pts = []
            for lon, lat in part:
                if lon < lon0 - 1 or lon > lon1 + 1 or lat < lat0 - 1 or lat > lat1 + 1:
                    if len(pts) > 1:
                        draw.line(pts, fill=255, width=1)
                        lines += 1
                    pts = []
                    continue
                pts.append(to_px(lon, lat))
            if len(pts) > 1:
                draw.line(pts, fill=255, width=1)
                lines += 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img.save(OUT_DIR / f"{name}.rivers.png")
    return lines


def main() -> None:
    src = Path(sys.argv[1])
    names = sys.argv[2:] or list(REGIONS)
    features = json.loads(src.read_text(encoding="utf-8"))["features"]
    for name in names:
        if name not in REGIONS:
            raise SystemExit(f"unknown region {name}: add it to regions.json")
        lines = draw_region(features, name, REGIONS[name])
        mask = Image.open(OUT_DIR / f"{name}.rivers.png")
        cells = sum(1 for v in mask.getdata() if v)
        print(f"{name}: {lines} lines, {cells} river cells")


if __name__ == "__main__":
    main()
