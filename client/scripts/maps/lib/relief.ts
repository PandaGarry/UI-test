/**
 * Relief by rank: land tiles are ordered by their elevation (ties by index, so the result is deterministic),
 * then the lowest `plainsShare` become plains (magnitude 0-9), the next `hillsShare` hills (10-19),
 * the rest mountains (20-30). The real elevation ORDER is kept; the class SHARES are fixed.
 * Water and impassable tiles are untouched (magnitude 0 for water).
 */
import {CELL_LAND, MAX_LAND_MAGNITUDE} from "@frontline/core/map/foundation/Foundation";

export function rankRelief(
	kinds: Uint8Array,
	elevation: Uint8Array,
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

