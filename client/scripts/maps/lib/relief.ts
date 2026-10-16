/**
 * Relief by rank: land tiles are ordered by their elevation (ties by index, so the result is deterministic),
 * then the lowest `plainsShare` become plains (magnitude 0-9), the next `hillsShare` hills (10-19),
 * the rest mountains (20-30). The real elevation ORDER is kept; the class SHARES are fixed.
 * Water and impassable tiles are untouched (magnitude 0 for water).
 */
import {CELL_LAND, MAX_LAND_MAGNITUDE} from "../../../../packages/core/src/map/foundation/Foundation";

export function rankRelief(
	kinds: Uint8Array,
	elevation: Float64Array | Uint8Array,
	plainsShare: number,
	hillsShare: number,
): Uint8Array {
	const n = kinds.length;
	const land: number[] = [];
	for (let i = 0; i < n; i++) if (kinds[i] === CELL_LAND) land.push(i);
	land.sort((a, b) => elevation[a] - elevation[b] || a - b);
	const nLand = land.length;
	const nPlains = Math.round(nLand * plainsShare);
	const nHills = Math.round(nLand * hillsShare);
	const out = new Uint8Array(n);
	for (let i = 0; i < n; i++) if (kinds[i] !== CELL_LAND) out[i] = 0;
	for (let r = 0; r < nLand; r++) {
		const i = land[r];
		let m: number;
		if (r < nPlains) m = Math.floor((r / Math.max(1, nPlains)) * 10);
		else if (r < nPlains + nHills) m = 10 + Math.floor(((r - nPlains) / Math.max(1, nHills)) * 10);
		else m = 20 + Math.floor(((r - nPlains - nHills) / Math.max(1, nLand - nPlains - nHills)) * 11);
		out[i] = Math.min(MAX_LAND_MAGNITUDE, m);
	}
	return out;
}


/**
 * Spatially smooth a per-cell value over LAND only (normalized box mean over land cells within `radius`).
 * Purpose: the raw elevation is quantised (8-bit) and noisy, so ranking it directly gives salt-and-pepper class
 * maps (about 11% of land neighbours differ in class on Europe). Smoothing before ranking keeps the ranges coherent
 * (radius 8 cells: about 2% differing neighbours). Water cells return 0. Deterministic: summed-area tables, no randomness.
 */
export function smoothOverLand(width: number, height: number, kinds: Uint8Array, value: Float64Array | Uint8Array, radius: number): Float64Array {
	const w = width, h = height;
	const sumV = new Float64Array((w + 1) * (h + 1));
	const sumN = new Float64Array((w + 1) * (h + 1));
	for (let y = 0; y < h; y++) {
		let rowV = 0, rowN = 0;
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			const isLand = kinds[i] === CELL_LAND ? 1 : 0;
			rowV += isLand ? value[i] : 0;
			rowN += isLand;
			const k = (y + 1) * (w + 1) + (x + 1);
			sumV[k] = sumV[k - (w + 1)] + rowV;
			sumN[k] = sumN[k - (w + 1)] + rowN;
		}
	}
	const out = new Float64Array(w * h);
	for (let y = 0; y < h; y++) {
		const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (kinds[i] !== CELL_LAND) continue;
			const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
			const a = y0 * (w + 1) + x0, b = y0 * (w + 1) + x1, c = y1 * (w + 1) + x0, d = y1 * (w + 1) + x1;
			const s = sumV[d] - sumV[b] - sumV[c] + sumV[a];
			const n = sumN[d] - sumN[b] - sumN[c] + sumN[a];
			out[i] = n > 0 ? s / n : 0;
		}
	}
	return out;
}

export const RELIEF_SMOOTH_RADIUS = 8;

/** Relief class of a magnitude: 0 plains (0-9), 1 hills (10-19), 2 mountains (20-30). */
export function reliefClass(m: number): number {
	return m < 10 ? 0 : m < 20 ? 1 : 2;
}

/**
 * Remove isolated relief cells (decision: option A, owner-approved). A land cell with at least one land
 * 4-neighbour, none of which shares its class, takes the magnitude of a land neighbour of the majority class.
 * Repeated until stable (bounded). Changes only class-boundary cells; shares move by a fraction of a percent.
 */
export function removeIsolatedRelief(
	width: number,
	height: number,
	kinds: Uint8Array,
	relief: Uint8Array,
	maxPasses = 50,
): {changed: number; passes: number; remaining: number} {
	const w = width, h = height;
	let changed = 0, passes = 0, remaining = 0;
	for (; passes < maxPasses; passes++) {
		let pass = 0;
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const i = y * w + x;
				if (kinds[i] !== CELL_LAND) continue;
				const c = reliefClass(relief[i]);
				const nb: number[] = [];
				if (x > 0 && kinds[i - 1] === CELL_LAND) nb.push(i - 1);
				if (x < w - 1 && kinds[i + 1] === CELL_LAND) nb.push(i + 1);
				if (y > 0 && kinds[i - w] === CELL_LAND) nb.push(i - w);
				if (y < h - 1 && kinds[i + w] === CELL_LAND) nb.push(i + w);
				if (nb.length === 0) continue;
				if (nb.some(j => reliefClass(relief[j]) === c)) continue;
				// Majority class among land neighbours (all differ from c). Ties: lowest class index.
				const counts = [0, 0, 0];
				for (const j of nb) counts[reliefClass(relief[j])]++;
				let best = 0;
				for (let k = 1; k < 3; k++) if (counts[k] > counts[best]) best = k;
				const donor = nb.find(j => reliefClass(relief[j]) === best);
				if (donor === undefined) continue;
				relief[i] = relief[donor];
				pass++;
			}
		}
		changed += pass;
		if (pass === 0) break;
	}
	// Count what is left (should be 0 unless maxPasses was hit).
	for (let i = 0; i < w * h; i++) {
		if (kinds[i] !== CELL_LAND) continue;
		const c = reliefClass(relief[i]);
		const x = i % w, y = (i - x) / w;
		let n = 0, same = 0;
		if (x > 0 && kinds[i - 1] === CELL_LAND) { n++; if (reliefClass(relief[i - 1]) === c) same++; }
		if (x < w - 1 && kinds[i + 1] === CELL_LAND) { n++; if (reliefClass(relief[i + 1]) === c) same++; }
		if (y > 0 && kinds[i - w] === CELL_LAND) { n++; if (reliefClass(relief[i - w]) === c) same++; }
		if (y < h - 1 && kinds[i + w] === CELL_LAND) { n++; if (reliefClass(relief[i + w]) === c) same++; }
		if (n > 0 && same === 0) remaining++;
	}
	return {changed, passes, remaining};
}
