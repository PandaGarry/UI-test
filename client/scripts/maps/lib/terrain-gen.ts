/**
 * Terrain generator v2 (tool, not runtime). Produces foundation bytes (docs/MAP-ARCHITECTURE-2026-10-16.md, 3.2).
 *
 * Pipeline (all deterministic from the seed; no Math.random, no sin/cos/exp/log/pow):
 *   1. Plates: random seed points with continental/oceanic type and a velocity vector.
 *      Base height is an inverse-distance blend of plate types (smooth, no polygon steps).
 *   2. Mountains: along plate boundaries, only where plates converge (relative velocity pointing at each other),
 *      with ridged noise so chains are irregular, not rings.
 *   3. Sea level: quantile so that land equals the target share before cleaning.
 *   4. Coast cleanup: majority filter removes 1-tile spikes and 1-tile holes.
 *   5. Small bodies: buildFoundation removes land < minIsland and lakes < minLake (project rules).
 *   6. Pit removal: priority-flood fill of land elevation from water, so every land tile drains to water.
 *      No closed inland basins (pits) remain.
 *   7. Relief: plains / hills / mountains by rank of filled elevation within land, with exact target shares.
 */
import {
	buildFoundation,
	CELL_LAND,
	CELL_WATER,
	decodeFoundationByte,
	MAX_LAND_MAGNITUDE,
} from "@frontline/core/map/foundation/Foundation";

export interface TerrainParams {
	readonly width: number;
	readonly height: number;
	readonly seed: number;
	/** Land share of all tiles (world: 0.326). */
	readonly targetLand: number;
	/** Relief shares of land tiles (world: 0.34 / 0.38 / rest). */
	readonly plainsShare: number;
	readonly hillsShare: number;
	readonly minIslandSize: number;
	readonly minLakeSize: number;
	readonly plates: number;
}

export const DEFAULT_TERRAIN_PARAMS: Omit<TerrainParams, "width" | "height" | "seed"> = {
	targetLand: 0.326,
	plainsShare: 0.34,
	hillsShare: 0.38,
	minIslandSize: 20,
	minLakeSize: 200,
	plates: 22,
};

export interface TerrainStats {
	landShare: number;
	plainsOfLand: number;
	hillsOfLand: number;
	mountainsOfLand: number;
	shoreOfLand: number;
	landBodies: number;
	landBodiesOver100: number;
	largestBodyShareOfLand: number;
	/** Land tiles whose 4 neighbours are all water (1-tile spikes). Must be 0. */
	spikes: number;
	/** Water tiles whose 4 neighbours are all land (1-tile holes). Must be 0. */
	holes: number;
	/** Land tiles with all 8 neighbours strictly higher (pits). Must be 0. */
	pits: number;
	/** Inland water bodies (not ocean) — lakes that survived the size rule. */
	lakes: number;
}

export interface TerrainResult {
	readonly foundation: Uint8Array;
	readonly stats: TerrainStats;
}

// ---------- deterministic randomness and noise ----------

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function latticeHash(x: number, y: number, seed: number): number {
	let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

/** Value noise in [0,1), smoothstep interpolation. */
function valueNoise(x: number, y: number, cell: number, seed: number): number {
	const gx = x / cell;
	const gy = y / cell;
	const x0 = Math.floor(gx);
	const y0 = Math.floor(gy);
	const tx = gx - x0;
	const ty = gy - y0;
	const sx = tx * tx * (3 - 2 * tx);
	const sy = ty * ty * (3 - 2 * ty);
	const a = latticeHash(x0, y0, seed);
	const b = latticeHash(x0 + 1, y0, seed);
	const c = latticeHash(x0, y0 + 1, seed);
	const d = latticeHash(x0 + 1, y0 + 1, seed);
	const top = a + (b - a) * sx;
	const bot = c + (d - c) * sx;
	return top + (bot - top) * sy;
}

// ---------- grid helpers ----------

/** 8-neighbourhood land count for each cell (border cells count outside as water). */
function landCount8(w: number, h: number, land: Uint8Array): Uint8Array {
	const out = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let c = 0;
			for (let dy = -1; dy <= 1; dy++) {
				const yy = y + dy;
				if (yy < 0 || yy >= h) continue;
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					const xx = x + dx;
					if (xx < 0 || xx >= w) continue;
					c += land[yy * w + xx];
				}
			}
			out[y * w + x] = c;
		}
	}
	return out;
}

/**
 * One majority pass on the land mask: land with <=2 land neighbours becomes water (removes spikes);
 * water with >=6 land neighbours becomes land (fills 1-2 tile holes and smooths concave corners).
 * Simultaneous update, so the result does not depend on scan order.
 */
export function smoothLandMask(w: number, h: number, land: Uint8Array): Uint8Array {
	const cnt = landCount8(w, h, land);
	const out = Uint8Array.from(land);
	for (let i = 0; i < w * h; i++) {
		if (land[i] && cnt[i] <= 2) out[i] = 0;
		else if (!land[i] && cnt[i] >= 6) out[i] = 1;
	}
	return out;
}

/**
 * Priority-flood (Barnes et al. 2014 style, deterministic tie-break by index).
 * Every land cell is raised to at least the level it must reach to drain to water,
 * so no closed basin (pit) remains. Water cells keep their elevation (sea level).
 * Returns a new Float64Array; input is not modified.
 */
export function fillLandPits(w: number, h: number, elevation: Float64Array, isWater: Uint8Array): Float64Array {
	const n = w * h;
	const filled = Float64Array.from(elevation);
	const done = new Uint8Array(n);
	// binary heap keyed by (level, index)
	const heapKey = new Float64Array(n + 1);
	const heapIdx = new Int32Array(n + 1);
	let size = 0;
	const less = (a: number, b: number) => heapKey[a] < heapKey[b] || (heapKey[a] === heapKey[b] && heapIdx[a] < heapIdx[b]);
	const swap = (a: number, b: number) => {
		const k = heapKey[a]; heapKey[a] = heapKey[b]; heapKey[b] = k;
		const i = heapIdx[a]; heapIdx[a] = heapIdx[b]; heapIdx[b] = i;
	};
	const push = (level: number, idx: number) => {
		size++;
		heapKey[size] = level;
		heapIdx[size] = idx;
		let c = size;
		while (c > 1 && less(c, c >> 1)) { swap(c, c >> 1); c >>= 1; }
	};
	const pop = (): number => {
		const top = heapIdx[1];
		heapKey[1] = heapKey[size];
		heapIdx[1] = heapIdx[size];
		size--;
		let p = 1;
		for (;;) {
			const l = p * 2;
			const r = l + 1;
			let m = p;
			if (l <= size && less(l, m)) m = l;
			if (r <= size && less(r, m)) m = r;
			if (m === p) break;
			swap(p, m);
			p = m;
		}
		return top;
	};

	// seeds: all water cells and border land cells (the border drains off the map)
	for (let i = 0; i < n; i++) {
		const x = i % w;
		const y = (i - x) / w;
		const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
		if (isWater[i] || border) {
			done[i] = 1;
			push(filled[i], i);
		}
	}
	while (size > 0) {
		const t = pop();
		const x = t % w;
		const y = (t - x) / w;
		const relax = (u: number) => {
			if (done[u]) return;
			done[u] = 1;
			if (filled[u] < filled[t]) filled[u] = filled[t];
			push(filled[u], u);
		};
		if (x > 0) relax(t - 1);
		if (x < w - 1) relax(t + 1);
		if (y > 0) relax(t - w);
		if (y < h - 1) relax(t + w);
	}
	return filled;
}

/** Counts strict local minima among land cells (all 8 neighbours strictly higher). */
export function countLandPits(w: number, h: number, elevation: Float64Array, isLand: Uint8Array): number {
	let pits = 0;
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x;
			if (!isLand[i]) continue;
			const e = elevation[i];
			let strict = true;
			for (let dy = -1; dy <= 1 && strict; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					if (elevation[(y + dy) * w + (x + dx)] <= e) { strict = false; break; }
				}
			}
			if (strict) pits++;
		}
	}
	return pits;
}

// ---------- elevation ----------

interface Plate {
	x: number;
	y: number;
	continental: boolean;
	vx: number;
	vy: number;
}

function makePlates(w: number, h: number, count: number, rnd: () => number): Plate[] {
	const plates: Plate[] = [];
	for (let k = 0; k < count; k++) {
		const len = Math.sqrt(0.0001 + rnd() * rnd()); // avoid zero velocity, no trig
		const ang = rnd() * 4 - 2; // direction as a free parameter, normalised below
		const vx0 = ang;
		const vy0 = rnd() * 2 - 1;
		const norm = Math.sqrt(vx0 * vx0 + vy0 * vy0) || 1;
		plates.push({
			x: rnd() * w,
			y: rnd() * h,
			continental: rnd() < 0.45,
			vx: (vx0 / norm) * len,
			vy: (vy0 / norm) * len,
		});
	}
	return plates;
}

/**
 * Raw elevation field (roughly -1..2, not normalised). Deterministic from the seed.
 * Land is decided later by sea level, so only relative values matter.
 */
export function buildElevationField(w: number, h: number, seed: number, plateCount: number): Float64Array {
	const rnd = mulberry32(seed);
	const plates = makePlates(w, h, plateCount, rnd);
	const scale = Math.min(w, h);
	const e = new Float64Array(w * h);
	const seedHi = seed ^ 0x9e3779b9;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			// warped coordinates make plate borders irregular
			const wx = x + (valueNoise(x, y, scale / 6, seedHi + 1) - 0.5) * scale / 4;
			const wy = y + (valueNoise(x, y, scale / 6, seedHi + 2) - 0.5) * scale / 4;

			// inverse-distance blend of plate base heights (1/d^4 via squared distance)
			let wsum = 0;
			let base = 0;
			let d1 = Infinity;
			let d2 = Infinity;
			let p1 = -1;
			let p2 = -1;
			for (let k = 0; k < plates.length; k++) {
				const p = plates[k];
				const dx = wx - p.x;
				const dy = wy - p.y;
				const d = dx * dx + dy * dy + 1;
				const wk = 1 / (d * d);
				wsum += wk;
				base += wk * (p.continental ? 0.6 : -0.25);
				if (d < d1) { d2 = d1; p2 = p1; d1 = d; p1 = k; }
				else if (d < d2) { d2 = d; p2 = k; }
			}
			base /= wsum;

			// boundary mountains: only at convergence, weighted by closeness to the border
			let mountain = 0;
			if (p2 >= 0) {
				const a = plates[p1];
				const b = plates[p2];
				const gap = (Math.sqrt(d2) - Math.sqrt(d1)) / scale; // 0 at the border
				const band = 0.10;
				if (gap < band) {
					const t = 1 - gap / band;
					const wb = t * t;
					// direction from a to b, and relative approach speed
					const nx = b.x - a.x;
					const ny = b.y - a.y;
					const nl = Math.sqrt(nx * nx + ny * ny) || 1;
					const approach = ((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) / nl;
					if (approach > 0) {
						const bothLand = a.continental && b.continental ? 1 : a.continental || b.continental ? 0.7 : 0.25;
						mountain = wb * approach * bothLand;
					}
				}
			}
			// ridged noise: sharp crests inside mountain zones
			const ridge = valueNoise(x, y, 28, seedHi + 3);
			const crest = 1 - Math.abs(2 * ridge - 1);
			const ridgeTerm = mountain * (0.5 + 0.9 * crest * crest);

			// fractal detail (4 octaves)
			let fbm = 0;
			let amp = 0.5;
			let norm = 0;
			let cell = 96;
			for (let o = 0; o < 4; o++) {
				fbm += amp * valueNoise(x, y, cell, seedHi + 10 + o);
				norm += amp;
				amp *= 0.5;
				cell /= 2;
			}
			fbm /= norm;

			e[y * w + x] = base + 0.9 * ridgeTerm + 0.35 * (fbm - 0.5);
		}
	}
	return e;
}

// ---------- full pipeline ----------

function quantileValue(values: Float64Array, fraction: number): number {
	// exact quantile via sort on a copy (deterministic); map sizes are small enough
	const sorted = Float64Array.from(values).sort();
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((1 - fraction) * (sorted.length - 1))));
	return sorted[idx];
}

export function generateTerrain(params: TerrainParams): TerrainResult {
	const {width: w, height: h, seed} = params;
	const n = w * h;
	const raw = buildElevationField(w, h, seed, params.plates);
	const options = {minIslandSize: params.minIslandSize, minLakeSize: params.minLakeSize};

	// Sea level: iterate so that the land share after cleanup hits the target.
	let want = params.targetLand;
	let foundation = new Uint8Array(n);
	let land = new Uint8Array(n);
	for (let iter = 0; iter < 8; iter++) {
		const sea = quantileValue(raw, want);
		land = new Uint8Array(n);
		for (let i = 0; i < n; i++) land[i] = raw[i] >= sea ? 1 : 0;
		land = smoothLandMask(w, h, smoothLandMask(w, h, land));
		const kinds = new Uint8Array(n);
		for (let i = 0; i < n; i++) kinds[i] = land[i] ? CELL_LAND : CELL_WATER;
		foundation = buildFoundation(w, h, kinds, new Uint8Array(n), options);
		let got = 0;
		for (let i = 0; i < n; i++) if (foundation[i] & 0x80) got++;
		const err = params.targetLand - got / n;
		if (Math.abs(err) < 0.0005) break;
		want = Math.min(0.99, Math.max(0.01, want + err));
	}

	// Land mask after removals; water = everything else.
	const isLand = new Uint8Array(n);
	for (let i = 0; i < n; i++) isLand[i] = foundation[i] & 0x80 ? 1 : 0;
	const isWater = new Uint8Array(n);
	for (let i = 0; i < n; i++) isWater[i] = isLand[i] ? 0 : 1;

	// Pit removal on land: water level = the sea level used for the mask.
	const sea = quantileValue(raw, want);
	const levelForWater = new Float64Array(n);
	for (let i = 0; i < n; i++) levelForWater[i] = isLand[i] ? raw[i] : sea;
	const filled = fillLandPits(w, h, levelForWater, isWater);
	const pits = countLandPits(w, h, filled, isLand);

	// Relief: rank of filled elevation within land, exact shares by class.
	const landIdx: number[] = [];
	for (let i = 0; i < n; i++) if (isLand[i]) landIdx.push(i);
	landIdx.sort((a, b) => filled[a] - filled[b] || a - b);
	const nLand = landIdx.length;
	const nPlains = Math.round(nLand * params.plainsShare);
	const nHills = Math.round(nLand * params.hillsShare);
	const elevation = new Uint8Array(n);
	for (let r = 0; r < nLand; r++) {
		const i = landIdx[r];
		let m: number;
		if (r < nPlains) m = Math.floor((r / Math.max(1, nPlains)) * 10); // 0-9
		else if (r < nPlains + nHills) m = 10 + Math.floor(((r - nPlains) / Math.max(1, nHills)) * 10); // 10-19
		else m = 20 + Math.floor(((r - nPlains - nHills) / Math.max(1, nLand - nPlains - nHills)) * 11); // 20-30
		elevation[i] = Math.min(MAX_LAND_MAGNITUDE, m);
	}
	const kinds = new Uint8Array(n);
	for (let i = 0; i < n; i++) kinds[i] = isLand[i] ? CELL_LAND : CELL_WATER;
	foundation = buildFoundation(w, h, kinds, elevation, options);

	const stats = measure(w, h, foundation);
	return {foundation, stats: {...stats, pits}};
}

/** Metrics from foundation bytes only (what the game will see). */
export function measure(w: number, h: number, foundation: Uint8Array): TerrainStats {
	const n = w * h;
	let land = 0;
	let plains = 0;
	let hills = 0;
	let mount = 0;
	let shore = 0;
	const isLand = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const d = decodeFoundationByte(foundation[i]);
		if (d.land && !d.impassable) {
			land++;
			isLand[i] = 1;
			if (d.terrain === "plains") plains++;
			else if (d.terrain === "hills") hills++;
			else mount++;
			if (d.shore) shore++;
		}
	}
	let spikes = 0;
	let holes = 0;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			const nb: number[] = [];
			if (x > 0) nb.push(isLand[i - 1]);
			if (x < w - 1) nb.push(isLand[i + 1]);
			if (y > 0) nb.push(isLand[i - w]);
			if (y < h - 1) nb.push(isLand[i + w]);
			if (nb.length === 4 && nb.every(v => v === 0) && isLand[i]) spikes++;
			if (nb.length === 4 && nb.every(v => v === 1) && !isLand[i]) holes++;
		}
	}
	// land bodies and inland lakes
	const seen = new Uint8Array(n);
	const stack = new Int32Array(n);
	const sizes: number[] = [];
	for (let s = 0; s < n; s++) {
		if (seen[s] || !isLand[s]) continue;
		let sp = 0;
		let size = 0;
		stack[sp++] = s;
		seen[s] = 1;
		while (sp > 0) {
			const t = stack[--sp];
			size++;
			const x = t % w;
			const y = (t - x) / w;
			if (x > 0 && !seen[t - 1] && isLand[t - 1]) { seen[t - 1] = 1; stack[sp++] = t - 1; }
			if (x < w - 1 && !seen[t + 1] && isLand[t + 1]) { seen[t + 1] = 1; stack[sp++] = t + 1; }
			if (y > 0 && !seen[t - w] && isLand[t - w]) { seen[t - w] = 1; stack[sp++] = t - w; }
			if (y < h - 1 && !seen[t + w] && isLand[t + w]) { seen[t + w] = 1; stack[sp++] = t + w; }
		}
		sizes.push(size);
	}
	sizes.sort((a, b) => b - a);
	// lakes: water not reachable from the border
	const reach = new Uint8Array(n);
	const q = new Int32Array(n);
	let qh = 0;
	let qt = 0;
	const seedW = (t: number) => { if (!isLand[t] && !reach[t]) { reach[t] = 1; q[qt++] = t; } };
	for (let x = 0; x < w; x++) { seedW(x); seedW((h - 1) * w + x); }
	for (let y = 0; y < h; y++) { seedW(y * w); seedW(y * w + w - 1); }
	while (qh < qt) {
		const t = q[qh++];
		const x = t % w;
		const y = (t - x) / w;
		if (x > 0) seedW(t - 1);
		if (x < w - 1) seedW(t + 1);
		if (y > 0) seedW(t - w);
		if (y < h - 1) seedW(t + w);
	}
	let lakes = 0;
	const lakeSeen = new Uint8Array(n);
	for (let s = 0; s < n; s++) {
		if (isLand[s] || reach[s] || lakeSeen[s]) continue;
		lakes++;
		let sp = 0;
		stack[sp++] = s;
		lakeSeen[s] = 1;
		while (sp > 0) {
			const t = stack[--sp];
			const x = t % w;
			const y = (t - x) / w;
			const push = (u: number) => { if (!isLand[u] && !lakeSeen[u]) { lakeSeen[u] = 1; stack[sp++] = u; } };
			if (x > 0) push(t - 1);
			if (x < w - 1) push(t + 1);
			if (y > 0) push(t - w);
			if (y < h - 1) push(t + w);
		}
	}
	return {
		landShare: land / n,
		plainsOfLand: plains / Math.max(1, land),
		hillsOfLand: hills / Math.max(1, land),
		mountainsOfLand: mount / Math.max(1, land),
		shoreOfLand: shore / Math.max(1, land),
		landBodies: sizes.length,
		landBodiesOver100: sizes.filter(s => s >= 100).length,
		largestBodyShareOfLand: (sizes[0] ?? 0) / Math.max(1, land),
		spikes,
		holes,
		pits: 0,
		lakes,
	};
}

export {mulberry32};
