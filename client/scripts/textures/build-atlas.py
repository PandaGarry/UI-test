"""
Builds the T atlas used by the map renderer: the four class tiles stacked vertically (512 x 2048, RGB), in the
class order the shader expects, plus atlas.json with the mean colour of each class.

Class order (must match MapRenderingShader.frag and MapRenderer.ts): 0 plains, 1 hills, 2 mountains, 3 water.
The renderer multiplies the palette colour by tile / mean, so the average colour of the map stays the palette colour.

Output: resources/textures/atlas.png and resources/textures/atlas.json.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / "resources" / "textures"
CLASSES = ["plains", "hills", "mountains", "water"]


def main() -> None:
    tiles = []
    means = []
    for name in CLASSES:
        img = Image.open(ROOT / f"{name}.png").convert("RGB")
        if img.size != (512, 512):
            raise SystemExit(f"{name}: expected 512x512, got {img.size}")
        arr = np.asarray(img).astype(np.float64)
        tiles.append(arr)
        means.append([round(float(v), 2) for v in arr.reshape(-1, 3).mean(axis=0)])
    atlas = np.concatenate(tiles, axis=0).astype(np.uint8)
    Image.fromarray(atlas, "RGB").save(ROOT / "atlas.png")
    (ROOT / "atlas.json").write_text(json.dumps({"classes": CLASSES, "tile": 512, "means": means}, indent=2) + "\n", encoding="utf-8")
    print("atlas", atlas.shape, "means", means)


if __name__ == "__main__":
    main()
