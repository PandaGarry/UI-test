import {territoryManager} from "@frontline/core/game/TerritoryManager";
import {gameMap} from "@frontline/core/game/GameData";
import {borderManager} from "@frontline/core/game/BorderManager";

/**
 * Visual rule (no effect on gameplay): a border line is not drawn where a territory meets water only.
 *
 * The border tiles come from the core BorderManager and are not changed. A border tile is drawn only if at least one
 * of its cardinal neighbours belongs to another owner and is land (or unowned land). A tile whose only other-owner
 * neighbours are water (rivers, lakes, sea) is painted as plain interior, so the river keeps its own colour along the
 * bank instead of being outlined in a dark border line.
 */
export function drawsBorderLine(tile: number, owner: number): boolean {
	if (!borderManager.getBorderTiles(owner).has(tile)) return false;
	const w = gameMap.width;
	const h = gameMap.height;
	const x = tile % w;
	const y = Math.floor(tile / w);
	const neighbours: [number, number][] = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
	for (const [nx, ny] of neighbours) {
		if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
		const n = ny * w + nx;
		if (territoryManager.getOwner(n) === owner) continue;
		if (!territoryManager.isWater(n)) return true;
	}
	return false;
}
