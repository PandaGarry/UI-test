// Замер карты теми же метриками, что docs/MAP-REFERENCE-STATS-2026-10-16.jsonl (скрипт эталона
// scripts/map-analysis/analyze-reference-maps.py). Читает PNG-палитру + JSON из resources/maps формата.
//
// Использование: node scripts/maps/measure-map.mjs build/pilot/Pilot.png build/pilot/Pilot.json

import {readFileSync} from "fs";
import {createRequire} from "module";

const require = createRequire(import.meta.url);
const {decodePNG} = require("../png-decode.js");

const [pngPath, jsonPath] = process.argv.slice(2);
const png = decodePNG(readFileSync(pngPath));
const def = JSON.parse(readFileSync(jsonPath, "utf8"));
const W = png.width, H = png.height, N = W * H;

const pal = def.tiles.map(t => [1, 3, 5].map(i => parseInt(t.color.slice(i, i + 2), 16)));
const cache = new Map();
const type = new Uint8Array(N);
for (let i = 0; i < N; i++) {
	const r = png.data[i * 4], g = png.data[i * 4 + 1], b = png.data[i * 4 + 2];
	const key = (r << 16) | (g << 8) | b;
	let best = cache.get(key);
	if (best === undefined) {
		let bd = Infinity;
		best = 0;
		pal.forEach((p, k) => {
			const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
			if (d < bd) { bd = d; best = k; }
		});
		cache.set(key, best);
	}
	type[i] = best;
}
const name = def.tiles.map(t => t.name);
const isLand = t => def.tiles[t].conquerable;

const cnt = new Array(def.tiles.length).fill(0);
let land = 0, shore = 0;
for (let i = 0; i < N; i++) {
	cnt[type[i]]++;
	if (!isLand(type[i])) continue;
	land++;
	const x = i % W, y = (i - x) / W;
	const waterNb = (x > 0 && !isLand(type[i - 1])) || (x < W - 1 && !isLand(type[i + 1])) ||
		(y > 0 && !isLand(type[i - W])) || (y < H - 1 && !isLand(type[i + W]));
	if (waterNb) shore++;
}

// тела суши (4-соседство)
const seen = new Uint8Array(N);
const sizes = [];
const stack = new Int32Array(N);
for (let s = 0; s < N; s++) {
	if (seen[s] || !isLand(type[s])) continue;
	let sp = 0, size = 0;
	stack[sp++] = s; seen[s] = 1;
	while (sp > 0) {
		const t = stack[--sp];
		size++;
		const x = t % W, y = (t - x) / W;
		const push = u => { if (!seen[u] && isLand(type[u])) { seen[u] = 1; stack[sp++] = u; } };
		if (x > 0) push(t - 1);
		if (x < W - 1) push(t + 1);
		if (y > 0) push(t - W);
		if (y < H - 1) push(t + W);
	}
	sizes.push(size);
}
sizes.sort((a, b) => b - a);
const big = sizes.filter(s => s >= 100);

const pct = (v, d) => +(100 * v / d).toFixed(2);
const idx = n => def.tiles.findIndex(t => t.name === n);
const plains = cnt[idx("Plains")], hills = cnt[idx("Hills")], mount = cnt[idx("Mountains")];

const result = {
	map: pngPath,
	w: W, h: H,
	"land%": pct(land, N),
	"water%": pct(N - land, N),
	"plains%_of_land": pct(plains, land),
	"hills%_of_land": pct(hills, land),
	"mountains%_of_land": pct(mount, land),
	"shoreline%_of_land": pct(shore, land),
	bodies: sizes.length,
	"bodies>=100": big.length,
	largest: sizes[0] ?? 0,
	"largest_share_of_land%": pct(sizes[0] ?? 0, land),
	"small_bodies_(<100)_tiles": sizes.reduce((s, v) => s + v, 0) - big.reduce((s, v) => s + v, 0),
	_names: name,
};

// Цели эталона world (docs/MAP-GENERATOR-SPEC-2026-10-16.md, раздел 1)
const target = {
	"land%": 32.6, "plains%_of_land": 34, "hills%_of_land": 38, "mountains%_of_land": 28,
	"shoreline%_of_land": 3.9, "bodies>=100": 53, "largest_share_of_land%": 34.7,
};
const tol = {"land%": 1, "plains%_of_land": 2, "hills%_of_land": 2, "mountains%_of_land": 2, "shoreline%_of_land": 1};
const rows = Object.keys(target).map(k => {
	const got = result[k];
	const diff = +(got - target[k]).toFixed(2);
	let verdict = "";
	if (k === "bodies>=100") {
		const within = Math.abs(got - target[k]) <= 0.3 * target[k];
		verdict = within ? "OK (±30%)" : "FAIL (±30%)";
	} else if (k === "largest_share_of_land%") {
		verdict = "info";
	} else {
		verdict = Math.abs(diff) <= tol[k] ? "OK" : "FAIL";
	}
	return {metric: k, got, target: target[k], diff, verdict};
});
delete result._names;
console.log(JSON.stringify(result, null, 2));
console.table(rows);
