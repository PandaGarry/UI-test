import {territoryManager} from "@frontline/core/game/TerritoryManager";
import {gameMap} from "@frontline/core/game/GameData";
import {borderManager} from "@frontline/core/game/BorderManager";

/**
 * Visual rule for the coast (no effect on gameplay).
 *
 * A land tile of a territory that touches water is left UNPAINTED (a 1-tile gap). The tile next to the gap
 * gets the border colour, so the territory keeps a clear line against the water instead of blending into it.
 * Water and the core border set are unchanged; this only decides the colour index of each tile.
 */

/** Palette index with alpha 0: a tile painted with it shows the map underneath (the gap). */
export const NO_FILL_INDEX = 65535;
/** Offset of the border colour in the palette (same as the territory renderer). */
export const BORDER_INDEX_OFFSET = 65536;

const NEIGHBOURS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function neighbourOf(tile: number, dx: number, dy: number): number {
	const w = gameMap.width;
	const x = tile % w + dx;
	const y = Math.floor(tile / w) + dy;
	if (x < 0 || y < 0 || x >= w || y >= gameMap.height) return -1;
	return y * w + x;
}

/** Land tile (not water) with at least one water neighbour. */
function touchesWater(tile: number): boolean {
	for (const [dx, dy] of NEIGHBOURS) {
		const n = neighbourOf(tile, dx, dy);
		if (n >= 0 && territoryManager.isWater(n)) return true;
	}
	return false;
}

/** Owned land tile of `owner` that is a gap tile (touches water). */
function isGapTile(tile: number, owner: number): boolean {
	return territoryManager.getOwner(tile) === owner && !territoryManager.isWater(tile) && touchesWater(tile);
}

/** Tile next to a gap tile of the same owner: it gets the border colour. */
function nextToGap(tile: number, owner: number): boolean {
	for (const [dx, dy] of NEIGHBOURS) {
		const n = neighbourOf(tile, dx, dy);
		if (n >= 0 && isGapTile(n, owner)) return true;
	}
	return false;
}

/**
 * Palette index for one owned tile:
 * - gap (land touching water): NO_FILL_INDEX;
 * - core border, or next to a gap: border colour (BORDER_INDEX_OFFSET + owner);
 * - otherwise: fill colour (owner).
 */
export function coastAwareIndex(tile: number, owner: number): number {
	if (isGapTile(tile, owner)) return NO_FILL_INDEX;
	if (borderManager.getBorderTiles(owner).has(tile) || nextToGap(tile, owner)) return BORDER_INDEX_OFFSET + owner;
	return owner;
}
