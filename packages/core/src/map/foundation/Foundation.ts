/**
 * Map foundation (layer F): the one-byte-per-tile data that the simulation depends on.
 * See docs/MAP-ARCHITECTURE-2026-10-16.md, section 3.2.
 *
 * Byte layout (same meaning as the reference format, written independently):
 *   bit 7  land      (1 = land, 0 = water)
 *   bit 6  shore     (land next to water, or water next to land)
 *   bit 5  ocean     (water connected to the map border)
 *   bits 0-4 magnitude (0-31)
 *     land : elevation, 0-9 plains, 10-19 hills, 20-31 mountains
 *     water: depth = ceil(distance to nearest land / 2), capped at 31
 *
 * Impassable tiles use the fixed byte IMPASSABLE_BYTE (land bit + magnitude 31, no shore/ocean).
 * They are never owned, attacked or crossed.
 *
 * Everything here is pure and deterministic: no Math.random, no trigonometry, no DOM.
 * Balance values (expansion cost/time per terrain class) live in BalanceConfig, not in the map file.
 */

export const FOUNDATION_VERSION = 1;

export const LAND_BIT = 0b1000_0000;
export const SHORE_BIT = 0b0100_0000;
export const OCEAN_BIT = 0b0010_0000;
export const MAGNITUDE_MASK = 0b0001_1111;
export const MAX_MAGNITUDE = 31;
/** Highest land elevation. 31 is reserved: land bit + 31 is the impassable byte. */
export const MAX_LAND_MAGNITUDE = 30;

/** Impassable: land bit + magnitude 31, no shore, no ocean. */
export const IMPASSABLE_BYTE = LAND_BIT | MAX_MAGNITUDE;

/** Input cell kinds for buildFoundation. */
export const CELL_WATER = 0;
export const CELL_LAND = 1;
export const CELL_IMPASSABLE = 2;

/** Elevation class thresholds (magnitude of land tiles): plains 0-9, hills 10-19, mountains 20-30. */
export const PLAINS_MAX = 9;
export const HILLS_MAX = 19;

export type TerrainClass = "water" | "plains" | "hills" | "mountains" | "impassable";

export interface FoundationTile {
	readonly land: boolean;
	readonly impassable: boolean;
	readonly shore: boolean;
	readonly ocean: boolean;
	readonly magnitude: number;
	readonly terrain: TerrainClass;
}

export function packFoundationByte(land: boolean, shore: boolean, ocean: boolean, magnitude: number): number {
	const cap = land ? MAX_LAND_MAGNITUDE : MAX_MAGNITUDE;
	const m = magnitude < 0 ? 0 : magnitude > cap ? cap : magnitude | 0;
	return (land ? LAND_BIT : 0) | (shore ? SHORE_BIT : 0) | (ocean ? OCEAN_BIT : 0) | m;
}

export function classifyLandMagnitude(magnitude: number): Exclude<TerrainClass, "water" | "impassable"> {
	if (magnitude <= PLAINS_MAX) return "plains";
	if (magnitude <= HILLS_MAX) return "hills";
	return "mountains";
}

export function decodeFoundationByte(byte: number): FoundationTile {
	const b = byte & 0xff;
	const land = (b & LAND_BIT) !== 0;
	const magnitude = b & MAGNITUDE_MASK;
	if (b === IMPASSABLE_BYTE) {
		return {land: true, impassable: true, shore: false, ocean: false, magnitude, terrain: "impassable"};
	}
	return {
		land,
		impassable: false,
		shore: (b & SHORE_BIT) !== 0,
		ocean: !land && (b & OCEAN_BIT) !== 0,
		magnitude,
		terrain: land ? classifyLandMagnitude(magnitude) : "water",
	};
}

export interface BuildFoundationOptions {
	/** Land bodies smaller than this become water (reference: 30; project decision: 20). */
	readonly minIslandSize: number;
	/** Water bodies inside land smaller than this become land (reference: 200). */
	readonly minLakeSize: number;
	/**
	 * Optional: water cells that are never removed as a lake (e.g. rivers, which are water channels, not lakes).
	 * A water body containing any such cell is kept whatever its size. Absent = no protection (default behaviour).
	 */
	readonly protectWater?: Uint8Array;
}

/**
 * Builds the foundation bytes from a cell map.
 * @param width map width in tiles
 * @param height map height in tiles
 * @param kinds CELL_WATER / CELL_LAND / CELL_IMPASSABLE per tile (row-major, index = y * width + x)
 * @param elevation land elevation 0-31 per tile (ignored for water and impassable)
 * @param options size thresholds for removing small bodies
 * @returns foundation bytes, one per tile
 */
export function buildFoundation(
	width: number,
	height: number,
	kinds: Uint8Array,
	elevation: Uint8Array,
	options: BuildFoundationOptions,
): Uint8Array {
	const n = width * height;
	if (kinds.length !== n || elevation.length !== n) {
		throw new Error(`buildFoundation: expected ${n} cells, got kinds=${kinds.length} elevation=${elevation.length}`);
	}
	const kind = Uint8Array.from(kinds);
	const elev = Uint8Array.from(elevation);

	// 1. Small land bodies become water.
	removeSmallBodies(width, height, kind, elev, CELL_LAND, options.minIslandSize, CELL_WATER, null);
	// 2. Ocean = water connected to the border. It is never removed, even if small.
	const ocean = markOceanFromBorder(width, height, kind);
	// 3. Small lakes (water bodies not touching the ocean) become flat land.
	const lakeProtect = options.protectWater
		? Uint8Array.from(ocean, (v, i) => (v || options.protectWater![i] ? 1 : 0))
		: ocean;
	removeSmallBodies(width, height, kind, elev, CELL_WATER, options.minLakeSize, CELL_LAND, lakeProtect);

	const out = new Uint8Array(n);
	const isLand = (i: number) => kind[i] === CELL_LAND;
	const isImpassable = (i: number) => kind[i] === CELL_IMPASSABLE;

	// Removing lakes cannot disconnect the ocean, so the step-2 flags stay valid.
	const depth = waterDepth(width, height, kind);

	for (let i = 0; i < n; i++) {
		if (isImpassable(i)) {
			out[i] = IMPASSABLE_BYTE;
			continue;
		}
		const x = i % width;
		const y = (i - x) / width;
		const shore = hasNeighbourOfOtherKind(width, height, x, y, i, isLand);
		if (isLand(i)) {
			out[i] = packFoundationByte(true, shore, false, Math.min(MAX_LAND_MAGNITUDE, elev[i]));
		} else {
			// Water next to impassable terrain is the deepest shade (reference behaviour).
			const nearVoid = hasNeighbourOf(width, height, x, y, isImpassable);
			const mag = nearVoid ? MAX_MAGNITUDE : Math.min(MAX_MAGNITUDE, Math.ceil(depth[i] / 2));
			out[i] = packFoundationByte(false, shore, ocean[i] === 1, mag);
		}
	}
	return out;
}

function hasNeighbourOfOtherKind(
	width: number,
	height: number,
	x: number,
	y: number,
	i: number,
	isLand: (j: number) => boolean,
): boolean {
	const self = isLand(i);
	return hasNeighbourOf(width, height, x, y, (j) => isLand(j) !== self, i);
}

function hasNeighbourOf(
	width: number,
	height: number,
	x: number,
	y: number,
	pred: (j: number) => boolean,
	self = -1,
): boolean {
	const i = self >= 0 ? self : y * width + x;
	if (x > 0 && pred(i - 1)) return true;
	if (x < width - 1 && pred(i + 1)) return true;
	if (y > 0 && pred(i - width)) return true;
	if (y < height - 1 && pred(i + width)) return true;
	return false;
}

/**
 * Converts every 4-connected body of `fromKind` smaller than `minSize` into `toKind`.
 * Impassable cells are never part of a body. Converted land gets elevation 0.
 * Bodies that contain a cell with `protect[i] === 1` are kept (used to keep the ocean).
 */
function removeSmallBodies(
	width: number,
	height: number,
	kind: Uint8Array,
	elev: Uint8Array,
	fromKind: number,
	minSize: number,
	toKind: number,
	protect: Uint8Array | null,
): void {
	const n = width * height;
	const seen = new Uint8Array(n);
	const stack = new Int32Array(n);
	const members = new Int32Array(n);
	for (let s = 0; s < n; s++) {
		if (seen[s] || kind[s] !== fromKind) continue;
		let sp = 0;
		let count = 0;
		stack[sp++] = s;
		seen[s] = 1;
		while (sp > 0) {
			const t = stack[--sp];
			members[count++] = t;
			const x = t % width;
			const y = (t - x) / width;
			if (x > 0 && !seen[t - 1] && kind[t - 1] === fromKind) { seen[t - 1] = 1; stack[sp++] = t - 1; }
			if (x < width - 1 && !seen[t + 1] && kind[t + 1] === fromKind) { seen[t + 1] = 1; stack[sp++] = t + 1; }
			if (y > 0 && !seen[t - width] && kind[t - width] === fromKind) { seen[t - width] = 1; stack[sp++] = t - width; }
			if (y < height - 1 && !seen[t + width] && kind[t + width] === fromKind) { seen[t + width] = 1; stack[sp++] = t + width; }
		}
		if (count >= minSize) continue;
		let protectedBody = false;
		if (protect) {
			for (let k = 0; k < count; k++) if (protect[members[k]]) { protectedBody = true; break; }
		}
		if (protectedBody) continue;
		for (let k = 0; k < count; k++) {
			const t = members[k];
			kind[t] = toKind;
			elev[t] = 0;
		}
	}
}

/** 1 = water connected to the map border (ocean), 0 otherwise. Land and impassable are 0. */
function markOceanFromBorder(width: number, height: number, kind: Uint8Array): Uint8Array {
	const n = width * height;
	const ocean = new Uint8Array(n);
	const stack = new Int32Array(n);
	let sp = 0;
	const seed = (t: number) => {
		if (kind[t] === CELL_WATER && !ocean[t]) { ocean[t] = 1; stack[sp++] = t; }
	};
	for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
	for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
	while (sp > 0) {
		const t = stack[--sp];
		const x = t % width;
		const y = (t - x) / width;
		if (x > 0 && !ocean[t - 1] && kind[t - 1] === CELL_WATER) { ocean[t - 1] = 1; stack[sp++] = t - 1; }
		if (x < width - 1 && !ocean[t + 1] && kind[t + 1] === CELL_WATER) { ocean[t + 1] = 1; stack[sp++] = t + 1; }
		if (y > 0 && !ocean[t - width] && kind[t - width] === CELL_WATER) { ocean[t - width] = 1; stack[sp++] = t - width; }
		if (y < height - 1 && !ocean[t + width] && kind[t + width] === CELL_WATER) { ocean[t + width] = 1; stack[sp++] = t + width; }
	}
	return ocean;
}

/**
 * Distance (4-neighbour steps) from each water tile to the nearest land tile, via multi-source BFS.
 * Land and impassable tiles get 0. Water with no land anywhere keeps the maximum distance.
 */
function waterDepth(width: number, height: number, kind: Uint8Array): Uint16Array {
	const n = width * height;
	const dist = new Uint16Array(n).fill(0xffff);
	const queue = new Int32Array(n);
	let head = 0;
	let tail = 0;
	for (let i = 0; i < n; i++) {
		if (kind[i] === CELL_LAND) { dist[i] = 0; queue[tail++] = i; }
		else if (kind[i] === CELL_IMPASSABLE) dist[i] = 0;
	}
	while (head < tail) {
		const t = queue[head++];
		const x = t % width;
		const y = (t - x) / width;
		const d = dist[t] + 1;
		const relax = (u: number) => {
			if (kind[u] === CELL_WATER && dist[u] > d) { dist[u] = d; queue[tail++] = u; }
		};
		if (x > 0) relax(t - 1);
		if (x < width - 1) relax(t + 1);
		if (y > 0) relax(t - width);
		if (y < height - 1) relax(t + width);
	}
	for (let i = 0; i < n; i++) {
		if (kind[i] === CELL_WATER && dist[i] === 0xffff) dist[i] = MAX_MAGNITUDE * 2;
		if (kind[i] !== CELL_WATER) dist[i] = 0;
	}
	return dist;
}
