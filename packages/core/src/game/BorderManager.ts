import {gameMap} from "./GameData";
import {territoryManager} from "./TerritoryManager";

const NO_OWNER = 65535;

/**
 * Tracks which owned tiles are border tiles (fewer than four neighbours with the same owner; map edges count as open).
 *
 * The sets are updated from the current owners of the changed tiles and their neighbours, not by incremental
 * counters. Incremental counters drifted when neighbours changed owner in an unexpected order, which left
 * "dots" of border colour inside territories.
 */
class BorderManager {
	/** Owner of each tile as last synchronised into the border sets. */
	private lastOwner: Uint16Array;
	private borderTiles: Set<number>[];

	/**
	 * Resets the border manager.
	 * Should only be called when a new game is started.
	 * @param playerCount The number of players in the game
	 * @internal
	 */
	reset(playerCount: number): void {
		this.lastOwner = new Uint16Array(gameMap.width * gameMap.height).fill(NO_OWNER);
		this.borderTiles = new Array(playerCount).fill(null).map(() => new Set());
	}

	/**
	 * Checks for updated borders after tiles changed owner.
	 * @param tiles The tiles whose owner changed.
	 * @param attacker The player that claimed the tiles (or -1 when tiles were cleared).
	 * @param defender The player that lost the tiles (or -1).
	 */
	transitionTiles(tiles: Set<number>, attacker: number, defender: number): BorderTransitionResult {
		const result: BorderTransitionResult = {territory: [], attacker: [], defender: [], defenderInner: []};
		const affected = new Set<number>();
		const w = gameMap.width;
		const h = gameMap.height;
		for (const tile of tiles) {
			affected.add(tile);
			const x = tile % w;
			const y = Math.floor(tile / w);
			if (x > 0) affected.add(tile - 1);
			if (x < w - 1) affected.add(tile + 1);
			if (y > 0) affected.add(tile - w);
			if (y < h - 1) affected.add(tile + w);
		}

		for (const tile of affected) {
			const owner = territoryManager.getOwner(tile);
			const previous = this.lastOwner[tile];
			if (previous !== owner) {
				if (previous < this.borderTiles.length) this.borderTiles[previous].delete(tile);
				this.lastOwner[tile] = owner;
			}
			if (owner >= this.borderTiles.length) continue; // no owner, or water
			const isBorder = this.isBorderOf(tile, owner);
			const set = this.borderTiles[owner];
			if (isBorder) set.add(tile); else set.delete(tile);
			if (owner === attacker) {
				(isBorder ? result.attacker : result.territory).push(tile);
			} else if (owner === defender) {
				(isBorder ? result.defender : result.defenderInner).push(tile);
			}
		}
		return result;
	}

	/** A tile is a border tile when one of its four sides is not owned by the same player (map edges count as open). */
	private isBorderOf(tile: number, owner: number): boolean {
		const w = gameMap.width;
		const x = tile % w;
		const y = Math.floor(tile / w);
		if (x === 0 || y === 0 || x === w - 1 || y === gameMap.height - 1) return true;
		return territoryManager.getOwner(tile - 1) !== owner || territoryManager.getOwner(tile + 1) !== owner ||
			territoryManager.getOwner(tile - w) !== owner || territoryManager.getOwner(tile + w) !== owner;
	}

	/**
	 * Gets the border tiles of a player.
	 * @param player The player to get the border tiles of
	 * @returns The border tiles of the player
	 */
	getBorderTiles(player: number): Set<number> {
		return this.borderTiles[player];
	}
}

export const borderManager = new BorderManager();
export type BorderTransitionResult = {
	territory: number[]; // Tiles of the attacker that are inner (not border)
	attacker: number[]; // Tiles of the attacker that are border
	defender: number[]; // Tiles of the defender that are border
	defenderInner: number[]; // Tiles of the defender that are inner
};
