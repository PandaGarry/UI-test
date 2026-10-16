"""
Composes the final T tiles: periodic base (periodic-base.py) + painterly AI detail (resources/textures/src).

Seamless by construction: the AI image is reduced to a 256x256 patch, and that patch is mirror-tiled into a 512x512
period (patch, mirrored x, mirrored y, mirrored both). Mirror repeat has continuous edges, so the tile wraps exactly.
Only the luminance detail (image minus its mean) is added, so the AI colours do not shift the palette.
Output: resources/textures/<class>.png, 512x512 RGB, used by the renderer as the T layer.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / "resources" / "textures"
SIZE = 512
DETAIL_GAIN = {"plains": 0.6, "hills": 0.6, "mountains": 0.55, "water": 0.35}


def mirror_tile(patch: np.ndarray) -> np.ndarray:
    top = np.concatenate([patch, patch[:, ::-1]], axis=1)
    bottom = top[::-1]
    return np.concatenate([top, bottom], axis=0)


def compose(name: str) -> Path:
    base = np.asarray(Image.open(ROOT / "base" / f"{name}.png").convert("RGB")).astype(np.float32)
    src = Image.open(ROOT / "src" / f"{name}.png").convert("RGB").resize((SIZE, SIZE), Image.BOX)
    s = np.asarray(src).astype(np.float32)
    patch = s[: SIZE // 2, : SIZE // 2]
    detail = mirror_tile(patch)
    detail -= detail.mean(axis=(0, 1), keepdims=True)
    out = np.clip(base + DETAIL_GAIN[name] * detail, 0, 255).astype(np.uint8)
    path = ROOT / f"{name}.png"
    Image.fromarray(out, "RGB").save(path)
    return path


def seam_ratio(path: Path) -> float:
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    seam = max(np.abs(a[:, 0] - a[:, -1]).mean(), np.abs(a[0] - a[-1]).mean())
    inner = np.abs(a[:, 1:] - a[:, :-1]).mean()
    return seam / inner


if __name__ == "__main__":
    names = sys.argv[1:] or list(DETAIL_GAIN)
    for n in names:
        p = compose(n)
        print(f"{n}: {p} seam/inner {seam_ratio(p):.3f}")
