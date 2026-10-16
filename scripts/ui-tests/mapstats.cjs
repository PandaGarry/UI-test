const fs = require("fs");
const {decodePNG} = require("/home/user/fix-wt/client/scripts/png-decode.js");
for (const name of ["World", "Europe"]) {
  const def = JSON.parse(fs.readFileSync(`resources/maps/${name}.json`, "utf8"));
  const png = decodePNG(fs.readFileSync(`resources/maps/${name}.png`));
  const pal = def.tiles.map(t => { const c = t.color.replace("#", ""); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); });
  const cnt = new Array(def.tiles.length).fill(0);
  const cache = new Map();
  for (let i = 0; i < png.width * png.height; i++) {
    const r = png.data[i * 4], g = png.data[i * 4 + 1], b = png.data[i * 4 + 2];
    const key = (r << 16) | (g << 8) | b;
    let best = cache.get(key);
    if (best === undefined) {
      let bd = Infinity; best = 0;
      pal.forEach((p, k) => { const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2; if (d < bd) { bd = d; best = k; } });
      cache.set(key, best);
    }
    cnt[best]++;
  }
  const total = png.width * png.height;
  console.log(name, png.width + "x" + png.height, def.tiles.map((t, k) => `${t.name}=${(100 * cnt[k] / total).toFixed(1)}%`).join(" "));
}
