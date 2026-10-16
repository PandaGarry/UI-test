"""
Seamless (periodic) base textures for the visual T layer. Built by FFT-filtered noise on a torus, so the tile
wraps exactly: the left edge equals the right edge, the top equals the bottom. Deterministic (fixed seed per class).
Output: resources/textures/base/<class>.png, 512x512 RGB. Painterly AI details are drawn on top separately.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 512
OUT = Path(__file__).resolve().parents[2] / "resources" / "textures" / "base"

# class: (seed, mean RGB from the theme palette, amplitude of the variation, detail scale)
CLASSES = {
    "plains":    (11, (190, 220, 138), 9.0, 1.0),
    "hills":     (22, (220, 203, 158), 8.0, 1.0),
    "mountains": (33, (230, 230, 230), 7.0, 1.3),
    "water":     (44, (71, 133, 181), 5.0, 0.8),
}


def periodic_noise(seed: int, size: int, scale: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((size, size))
    f = np.fft.fftfreq(size)
    fx, fy = np.meshgrid(f, f)
    r = np.sqrt(fx * fx + fy * fy)
    # band-pass: keep frequencies around 1/(scale*16), so features are a few dozen pixels, not pixel noise
    centre = 1.0 / (16.0 * scale)
    band = np.exp(-((r - centre) ** 2) / (2 * (centre * 0.6) ** 2))
    field = np.real(np.fft.ifft2(np.fft.fft2(white) * band))
    field -= field.mean()
    field /= field.std() + 1e-9
    return field


def build(name: str) -> Path:
    seed, mean, amp, scale = CLASSES[name]
    n = periodic_noise(seed, SIZE, scale) * amp
    n2 = periodic_noise(seed + 1000, SIZE, scale * 0.5) * amp * 0.5
    grain = periodic_noise(seed + 2000, SIZE, 0.2) * amp * 0.25
    v = (n + n2 + grain)[..., None]
    rgb = np.clip(np.array(mean, dtype=np.float32)[None, None, :] + v, 0, 255).astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    Image.fromarray(rgb, "RGB").save(path)
    return path


def seam_error(path: Path) -> float:
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    horiz = np.abs(a[:, 0] - a[:, -1]).mean()
    vert = np.abs(a[0] - a[-1]).mean()
    inner = np.abs(a[:, 1:] - a[:, :-1]).mean()
    return max(horiz, vert) / inner


if __name__ == "__main__":
    names = sys.argv[1:] or list(CLASSES)
    for name in names:
        p = build(name)
        print(f"{name}: {p} seam/inner ratio {seam_error(p):.3f}")
