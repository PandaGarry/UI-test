// Пилот собственного генератора карт (docs/MAP-GENERATOR-SPEC-2026-10-16.md, раздел 2).
//
// Детерминированно: сид -> карта. Без Math.random, без sin/cos/exp/log/pow.
// Выход — PNG-палитра + JSON в формате resources/maps (тот же конвейер, что World/Europe).
// По умолчанию пишет в client/build/pilot/ (папка не в git), боевые карты не трогает.
//
// Использование:
//   node scripts/maps/generate-pilot-map.mjs [--seed 1] [--name Pilot] [--w 2000] [--h 1000]
//                                           [--land 0.326] [--out build/pilot]

import {createHash} from "crypto";
import {deflateSync} from "zlib";
import {mkdirSync, writeFileSync, readFileSync} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = join(here, "..", "..");

function arg(name, def) {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : def;
}

const SEED = Number(arg("seed", 1)) >>> 0;
const NAME = arg("name", "Pilot");
const W = Number(arg("w", 2000));
const H = Number(arg("h", 1000));
const TARGET_LAND = Number(arg("land", 0.326)); // доля суши от всех клеток (эталон world: 32.6%)
const TARGET_PLAINS = Number(arg("plains", 0.34)); // доли рельефа от суши (эталон world)
const TARGET_HILLS = Number(arg("hills", 0.38));
const MIN_ISLAND = Number(arg("min-island", 20)); // решение пользователя: порог мелких островов 20 клеток
const OUT = arg("out", join(clientDir, "build", "pilot"));

// ---------- PRNG (mulberry32) ----------
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rnd = mulberry32(SEED);

// ---------- целочисленный хеш узла решётки ----------
function latticeHash(x, y, seed) {
	let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

// value-noise, сглаживание t*t*(3-2t), без тригонометрии
function valueNoise(x, y, cell, seed) {
	const gx = x / cell, gy = y / cell;
	const x0 = Math.floor(gx), y0 = Math.floor(gy);
	const tx0 = gx - x0, ty0 = gy - y0;
	const sx = tx0 * tx0 * (3 - 2 * tx0), sy = ty0 * ty0 * (3 - 2 * ty0);
	const a = latticeHash(x0, y0, seed), b = latticeHash(x0 + 1, y0, seed);
	const c = latticeHash(x0, y0 + 1, seed), d = latticeHash(x0 + 1, y0 + 1, seed);
	const top = a + (b - a) * sx, bot = c + (d - c) * sx;
	return top + (bot - top) * sy;
}

// ---------- 1. Поле высот ----------
const N = W * H;
const height = new Float32Array(N);

// «континенты»: K центров с радиусами, слегка искажённые шумом
const K = Number(arg("k", 12)) + Math.floor(rnd() * 3);
const RSCALE = Number(arg("rscale", 0.6));
const centers = [];
for (let k = 0; k < K; k++) {
	centers.push({
		x: rnd() * W,
		y: H * (0.15 + rnd() * 0.7),
		r: Math.min(W, H) * (0.22 + rnd() * 0.18) * RSCALE,
	});
}

// октавы шума: больше высоких частот — больше островов и изрезанный берег (подбор в пилоте)
const fbmWeights = [
	{cell: 256, w: Number(arg("w256", 0.2))},
	{cell: 128, w: Number(arg("w128", 0.2))},
	{cell: 64, w: Number(arg("w64", 0.15))},
	{cell: 32, w: Number(arg("w32", 0.2))},
	{cell: 16, w: Number(arg("w16", 0.25))},
	{cell: 8, w: Number(arg("w8", 0.1))},
];
const CONT_WEIGHT = Number(arg("wcont", 0.5));
const fbmNorm = fbmWeights.reduce((s, o) => s + o.w, 0);

for (let y = 0; y < H; y++) {
	for (let x = 0; x < W; x++) {
		// континентальная маска: максимум по центрам, искажение шумом (без trig)
		const warp = (valueNoise(x, y, 180, SEED ^ 0x9e37) - 0.5) * 140;
		const warpY = (valueNoise(x, y, 180, SEED ^ 0x51ed) - 0.5) * 140;
		let cont = 0;
		for (const c of centers) {
			const dx = x + warp - c.x, dy = y + warpY - c.y;
			const d = Math.sqrt(dx * dx + dy * dy);
			const v = 1 - d / c.r;
			if (v > cont) cont = v;
		}
		let fbm = 0;
		for (let o = 0; o < fbmWeights.length; o++) {
			const f = fbmWeights[o];
			fbm += f.w * valueNoise(x, y, f.cell, SEED + 17 * (o + 1));
		}
		fbm /= fbmNorm;
		height[y * W + x] = CONT_WEIGHT * Math.min(1, Math.max(0, cont)) + (1 - CONT_WEIGHT) * fbm;
	}
}

// сглаживание поля (box blur 5x5, 2 прохода) — гладкая береговая линия
function boxBlur(src, r) {
	const tmp = new Float32Array(N);
	const out = new Float32Array(N);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			let s = 0, n = 0;
			for (let k = -r; k <= r; k++) {
				const xx = x + k;
				if (xx >= 0 && xx < W) { s += src[y * W + xx]; n++; }
			}
			tmp[y * W + x] = s / n;
		}
	}
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			let s = 0, n = 0;
			for (let k = -r; k <= r; k++) {
				const yy = y + k;
				if (yy >= 0 && yy < H) { s += tmp[yy * W + x]; n++; }
			}
			out[y * W + x] = s / n;
		}
	}
	return out;
}
const BLUR = Number(arg("blur", 1));
let field = BLUR > 0 ? boxBlur(height, BLUR) : height;
// пиксельный шум у берега: рваная линия без изменения крупной структуры (детерминирован от сида)
const JITTER = Number(arg("jitter", 0.02));
if (JITTER > 0) {
	for (let i = 0; i < N; i++) {
		const x = i % W, y = (i - x) / W;
		field[i] += (latticeHash(x, y, SEED ^ 0x77) - 0.5) * JITTER;
	}
}

// ---------- 2. Маска суши по квантилю ----------
function quantileThreshold(values, landFraction) {
	// гистограмма 4096 корзин, точность достаточна для допуска ±1 п.п.
	const BINS = 4096;
	let min = Infinity, max = -Infinity;
	for (let i = 0; i < values.length; i++) {
		const v = values[i];
		if (v < min) min = v;
		if (v > max) max = v;
	}
	const hist = new Uint32Array(BINS);
	const scale = (BINS - 1) / (max - min || 1);
	for (let i = 0; i < values.length; i++) hist[Math.floor((values[i] - min) * scale)]++;
	const want = Math.round(values.length * landFraction);
	let acc = 0;
	for (let b = BINS - 1; b >= 0; b--) {
		acc += hist[b];
		if (acc >= want) return min + (b / scale);
	}
	return min;
}

// связные тела суши (4-соседство); возвращает метки и размеры
function labelBodies(mask) {
	const label = new Int32Array(N).fill(-1);
	const sizes = [];
	const stack = new Int32Array(N);
	for (let s = 0; s < N; s++) {
		if (!mask[s] || label[s] !== -1) continue;
		const id = sizes.length;
		let sp = 0, size = 0;
		stack[sp++] = s;
		label[s] = id;
		while (sp > 0) {
			const t = stack[--sp];
			size++;
			const x = t % W, y = (t - x) / W;
			if (x > 0 && mask[t - 1] && label[t - 1] === -1) { label[t - 1] = id; stack[sp++] = t - 1; }
			if (x < W - 1 && mask[t + 1] && label[t + 1] === -1) { label[t + 1] = id; stack[sp++] = t + 1; }
			if (y > 0 && mask[t - W] && label[t - W] === -1) { label[t - W] = id; stack[sp++] = t - W; }
			if (y < H - 1 && mask[t + W] && label[t + W] === -1) { label[t + W] = id; stack[sp++] = t + W; }
		}
		sizes.push(size);
	}
	return {label, sizes};
}

// подбор порога: суша = целевая доля ПОСЛЕ удаления мелких тел (итерации)
let landFrac = TARGET_LAND;
let mask = new Uint8Array(N);
let removedSmall = 0;
for (let iter = 0; iter < 6; iter++) {
	const thr = quantileThreshold(field, landFrac);
	for (let i = 0; i < N; i++) mask[i] = field[i] >= thr ? 1 : 0;
	const {label, sizes} = labelBodies(mask);
	removedSmall = 0;
	for (let i = 0; i < N; i++) {
		if (mask[i] && sizes[label[i]] < MIN_ISLAND) { mask[i] = 0; removedSmall++; }
	}
	let landNow = 0;
	for (let i = 0; i < N; i++) landNow += mask[i];
	const got = landNow / N;
	const err = TARGET_LAND - got;
	if (Math.abs(err) < 0.0005) break;
	landFrac = Math.min(0.99, Math.max(0.01, landFrac + err));
}

// ---------- 3. Рельеф: квантили высоты внутри суши ----------
const landIdx = [];
for (let i = 0; i < N; i++) if (mask[i]) landIdx.push(i);
landIdx.sort((a, b) => field[a] - field[b] || a - b);
const nPlains = Math.round(landIdx.length * TARGET_PLAINS);
const nHills = Math.round(landIdx.length * TARGET_HILLS);
// TYPE: 0 вода, 1 равнина, 2 холм, 3 гора
const TYPE_WATER = 0, TYPE_PLAINS = 1, TYPE_HILLS = 2, TYPE_MOUNTAINS = 3;
const type = new Uint8Array(N);
for (let r = 0; r < landIdx.length; r++) {
	const i = landIdx[r];
	type[i] = r < nPlains ? TYPE_PLAINS : r < nPlains + nHills ? TYPE_HILLS : TYPE_MOUNTAINS;
}

// ---------- 4. Палитра (как World.json) и вариации цвета ----------
const palette = [
	{name: "Water", color: "#A4D9ED", colorBase: "water", colorVariant: 4, conquerable: false, navigable: true},
	{name: "Plains", color: "#E2E2B8", colorBase: "grass", colorVariant: 6, conquerable: true, navigable: false, expansionCost: 50, expansionTime: 50},
	{name: "Hills", color: "#D6D6B2", colorBase: "grass", colorVariant: 12, conquerable: true, navigable: false, expansionCost: 75, expansionTime: 50},
	{name: "Mountains", color: "#E2E2D0", colorBase: "mountain", colorVariant: 12, conquerable: true, navigable: false, expansionCost: 85, expansionTime: 50},
];
const base = palette.map(p => [1, 3, 5].map(i => parseInt(p.color.slice(i, i + 2), 16)));

// детерминированный шум цвета ±3 (слой V, только отрисовка; геймплей не меняет)
const rgb = Buffer.alloc(N * 3);
for (let y = 0; y < H; y++) {
	for (let x = 0; x < W; x++) {
		const i = y * W + x;
		const t = type[i];
		const j = (latticeHash(x, y, SEED ^ 0xabc) - 0.5) * 6;
		const c = base[t];
		rgb[i * 3] = Math.max(0, Math.min(255, Math.round(c[0] + j)));
		rgb[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(c[1] + j)));
		rgb[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(c[2] + j)));
	}
}

// ---------- 5. PNG (RGB, 8 бит) ----------
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	crcTable[n] = c >>> 0;
}
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
	raw[y * (W * 3 + 1)] = 0; // фильтр None
	rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	chunk("IHDR", ihdr),
	chunk("IDAT", deflateSync(raw, {level: 9})),
	chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(OUT, {recursive: true});
writeFileSync(join(OUT, `${NAME}.png`), png);
writeFileSync(join(OUT, `${NAME}.json`), JSON.stringify({tiles: palette}, null, 2) + "\n");

const sha = createHash("sha256").update(png).digest("hex");
const landCount = landIdx.length;
console.log(JSON.stringify({
	name: NAME, seed: SEED, w: W, h: H, out: join(OUT, `${NAME}.png`),
	land_pct: +(100 * landCount / N).toFixed(2),
	removed_small_tiles: removedSmall,
	sha256: sha,
}));
