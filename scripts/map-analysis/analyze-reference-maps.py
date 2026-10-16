"""Statistics of reference map.bin files (analysis only; no map data is copied into our project).

Byte layout (from the reference map generator's documented packing): bit7 land, bit6 shoreline,
bit5 ocean, bits0-4 magnitude. Impassable = 0b10011111 (not counted as land).
Usage: python3 analyze-reference-maps.py <map_dir> [more dirs...]
"""
import json, sys, os
from collections import deque, Counter

IMP = 0b10011111

def analyze(dirpath):
    man = json.load(open(os.path.join(dirpath, "manifest.json")))
    w, h = man["map"]["width"], man["map"]["height"]
    data = open(os.path.join(dirpath, "map.bin"), "rb").read()
    n = w * h
    assert len(data) == n, (len(data), n)
    imp = land = water = shore = ocean = 0
    cls = Counter()
    water_mag = Counter()
    for b in data:
        if b == IMP:
            imp += 1
            continue
        if b & 0x80:
            land += 1
            m = b & 0x1F
            if m < 10: cls["plains"] += 1
            elif m < 20: cls["hills"] += 1
            else: cls["mountains"] += 1
            if b & 0x40: shore += 1
        else:
            water += 1
            if b & 0x20: ocean += 1
            water_mag[min(31, b & 0x1F)] += 1
    # connected land bodies (4-neighbourhood, impassable is not land)
    seen = bytearray(n)
    sizes = []
    for start in range(n):
        if seen[start] or not (data[start] & 0x80) or data[start] == IMP:
            continue
        q = deque([start]); seen[start] = 1; c = 0
        while q:
            t = q.popleft(); c += 1
            x = t % w; y = t // w
            for nb, ok in ((t - 1, x > 0), (t + 1, x < w - 1), (t - w, y > 0), (t + w, y < h - 1)):
                if ok and not seen[nb] and (data[nb] & 0x80) and data[nb] != IMP:
                    seen[nb] = 1; q.append(nb)
        sizes.append(c)
    sizes.sort(reverse=True)
    big = [s for s in sizes if s >= 100]
    out = {
        "map": os.path.basename(dirpath), "w": w, "h": h,
        "land%": round(100 * land / n, 2), "water%": round(100 * water / n, 2), "impassable%": round(100 * imp / n, 3),
        "plains%": round(100 * cls["plains"] / n, 2), "hills%": round(100 * cls["hills"] / n, 2), "mountains%": round(100 * cls["mountains"] / n, 2),
        "shoreline_land%_of_land": round(100 * shore / max(1, land), 2), "ocean%_of_water": round(100 * ocean / max(1, water), 2),
        "bodies": len(sizes), "bodies>=100": len(big), "largest": sizes[0] if sizes else 0,
        "largest_share_of_land%": round(100 * (sizes[0] if sizes else 0) / max(1, land), 2),
        "small_bodies_(<100)_tiles": sum(sizes) - sum(big),
        "water_mag_p50": None, "water_mag_p90": None,
    }
    tot = sum(water_mag.values()); acc = 0; p50 = p90 = None
    for m in sorted(water_mag):
        acc += water_mag[m]
        if p50 is None and acc >= 0.5 * tot: p50 = m
        if p90 is None and acc >= 0.9 * tot: p90 = m
    out["water_mag_p50"], out["water_mag_p90"] = p50, p90
    return out

if __name__ == "__main__":
    for d in sys.argv[1:]:
        print(json.dumps(analyze(d), ensure_ascii=False))
