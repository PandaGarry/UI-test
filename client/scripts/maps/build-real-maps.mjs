// Builds Europe and World from Natural Earth land (public domain) at the reference sizes.
// Usage: node scripts/maps/build-real-maps.mjs  (then npm run gen-maps)
import {writeFileSync} from "fs";
import {fileURLToPath} from "url";
const mapsDir = fileURLToPath(new URL("../../resources/maps/", import.meta.url));
import {rasterize, writePNG} from "./rasterize-land.mjs";
const WATER = [27, 58, 90], LAND = [200, 185, 138];
const hex = c => "#" + c.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
const types = [
  {color: hex(WATER), name: "Water", colorBase: "water", colorVariant: 4, conquerable: false, navigable: true},
  {color: hex(LAND), name: "Land", colorBase: "grass", colorVariant: 6, conquerable: true, navigable: false, expansionCost: 50, expansionTime: 50},
];
const maps = {
  Europe: {W: 2904, H: 1672, lon0: -25, lon1: 40, lat0: 36, lat1: 68},
  World: {W: 2000, H: 1000, lon0: -180, lon1: 180, lat0: -90, lat1: 90},
};
for (const [name, p] of Object.entries(maps)) {
  const r = rasterize(p);
  writePNG(`${mapsDir}${name}.png`, p.W, p.H, r.grid, WATER, LAND);
  writeFileSync(`${mapsDir}${name}.json`, JSON.stringify({tiles: types}, null, 2) + "\n");
  console.log(name, p.W + "x" + p.H, "land", r.count);
}
