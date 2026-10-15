import type {GameTheme} from "../GameTheme";
import {territoryManager} from "../../game/TerritoryManager";
import {gameMap, isPlaying} from "../../game/GameData";
import {territoryRenderer} from "../layer/TerritoryRenderer";
import {borderManager} from "../../game/BorderManager";

/**
 * Queue of tile updates for the territory layer.
 *
 * Updates go into growable typed arrays instead of JS arrays: a large attack paints thousands of tiles per tick,
 * and boxing every number made each frame allocate and copy far more memory than needed.
 *
 * When a player claims a tile, three types of updates are required:
 * 1. The tile can become a border tile of the player's territory.
 * 2. The tile can become an inner tile of the player's territory.
 * 3. A neighboring tile can become a border tile of the player's territory.
 */
export class TerritoryRenderingManager {
	private tileData = new Uint32Array(4096);
	private updateData = new Uint32Array(4096);
	private count = 0;

	/** Number of queued updates. */
	get pending(): number {
		return this.count;
	}

	/** Queued tile indices (view, valid until the next {@link take}). */
	get tiles(): Uint32Array {
		return this.tileData.subarray(0, this.count);
	}

	/** Queued update values matching {@link tiles} (view, valid until the next {@link take}). */
	get updates(): Uint32Array {
		return this.updateData.subarray(0, this.count);
	}

	/** Empties the queue after the renderer has uploaded it. */
	take(): void {
		this.count = 0;
	}

	private push(tile: number, update: number): void {
		if (this.count === this.tileData.length) {
			const grown = new Uint32Array(this.tileData.length * 2);
			grown.set(this.tileData);
			this.tileData = grown;
			const grownUpdates = new Uint32Array(this.updateData.length * 2);
			grownUpdates.set(this.updateData);
			this.updateData = grownUpdates;
		}
		this.tileData[this.count] = tile;
		this.updateData[this.count] = update;
		this.count++;
	}

	/**
	 * Clear the tiles at the given indices.
	 * @param tiles the tiles to clear
	 */
	clearTiles(tiles: number[] | Set<number>): void {
		for (const tile of tiles) this.push(tile, territoryManager.OWNER_NONE);
	}

	/**
	 * Paint a tile.
	 * @param tiles the tiles to paint
	 * @param player the player to paint the tiles for
	 * @internal
	 */
	paintTiles(tiles: number[], player: number): void {
		for (const tile of tiles) this.push(tile, player);
	}

	/**
	 * Paint a border tile.
	 * @param tiles the tiles to paint
	 * @param player the player to paint the tiles for
	 * @internal
	 */
	paintBorderTiles(tiles: number[], player: number): void {
		for (const tile of tiles) this.push(tile, 65536 + player);
	}

	/**
	 * Force a repaint of the territory layer.
	 */
	forceRepaint(theme: GameTheme): void {
		if (!isPlaying) return;
		territoryRenderer.updatePalette(theme);
		const total = gameMap.width * gameMap.height;
		for (let i = 0; i < total; i++) {
			const owner = territoryManager.getOwner(i);
			if (owner !== territoryManager.OWNER_NONE && owner !== territoryManager.OWNER_NONE - 1) {
				this.push(i, borderManager.getBorderTiles(owner).has(i) ? 65536 + owner : owner);
			}
		}
	}
}
