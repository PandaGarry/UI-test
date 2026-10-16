import type {Player} from "../player/Player";
import {territoryManager} from "../TerritoryManager";
import {bordersTile} from "../MathUtil";
import {random} from "../Random";
import {gameMap} from "../GameData";
import {TerritoryTransaction} from "../transaction/TerritoryTransaction";
import {borderManager} from "../BorderManager";
import {gameTicker} from "../GameTicker";
import {attackLogic, terrainOf, terrainPriorityBonus} from "./AttackRules";
import {playerManager} from "../player/PlayerManager";

/**
 * A player with no troops left loses the tiles it still holds inside another player's land: every tile of
 * `defeated` whose four sides belong to one other player becomes that player's tile (the reference behaviour
 * for enclaves once the owner has no force left). Edge tiles of the map are never enclosed.
 */
export function convertEnclaves(defeated: Player): void {
	const w = gameMap.width;
	const h = gameMap.height;
	const transactions = new Map<number, TerritoryTransaction>();
	for (let i = 0; i < w * h; i++) {
		if (territoryManager.getOwner(i) !== defeated.id) continue;
		const x = i % w;
		const y = Math.floor(i / w);
		if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
		const winner = territoryManager.getOwner(i - 1);
		if (winner === defeated.id || winner >= playerManager.getPlayers().length) continue;
		if (territoryManager.getOwner(i + 1) !== winner || territoryManager.getOwner(i - w) !== winner || territoryManager.getOwner(i + w) !== winner) continue;
		let transaction = transactions.get(winner);
		if (!transaction) {
			transaction = new TerritoryTransaction(playerManager.getPlayer(winner), defeated);
			transactions.set(winner, transaction);
		}
		territoryManager.conquer(i, winner, transaction);
	}
	for (const transaction of transactions.values()) transaction.apply();
}

/**
 * One attack from a player against a target player or unclaimed land (docs/PARITY.md section 2).
 *
 * Each tick the attack conquers frontier tiles, cheapest first, until the tick budget (1.0) is spent.
 * Every conquered tile costs attacker troops and defender troops (see AttackRules). The frontier is a
 * priority queue: tiles with more own neighbours and flat terrain are taken first.
 */
export class AttackExecutor {
	private readonly transaction: TerritoryTransaction;
	readonly player: Player;
	readonly target: Player | null;
	private troops: number;
	/** Min-heap of frontier tiles by priority (lower first). */
	private heap: {tile: number; pri: number}[] = [];
	/** Tiles currently in the heap; this is the attack's border size. */
	private frontier = new Set<number>();

	constructor(player: Player, target: Player | null, troops: number, borderTiles: Set<number> | null = null) {
		this.transaction = new TerritoryTransaction(player, target);
		this.player = player;
		this.target = target;
		this.troops = troops;
		for (const tile of borderTiles ?? borderManager.getBorderTiles(this.player.id)) {
			this.addNeighbors(tile);
		}
	}

	/** Add troops to the attack (a second attack on the same target was merged into this one). */
	modifyTroops(amount: number): void {
		this.troops += amount;
	}

	/**
	 * Oppose an attack from the target: troops of this attack are reduced.
	 * @returns true if this attack is still alive after the opposition.
	 */
	oppose(troopCount: number): boolean {
		if (this.troops > troopCount) {
			this.troops -= troopCount;
			return true;
		}
		return false;
	}

	/** Troops that are still in the attack (returned to the attacker when it ends). */
	getTroops(): number {
		return Math.max(0, Math.floor(this.troops));
	}

	/**
	 * Tick the attack.
	 * @returns true while the attack goes on; false when it has ended and its troops should be returned.
	 */
	tick(): boolean {
		const targetId = this.target ? this.target.id : territoryManager.OWNER_NONE;
		const transaction = this.transaction;
		let budget = 1;
		// Every conquered tile must reach the transaction (border sets are updated on apply), so apply on every exit.
		try {
			while (budget > 0) {
				if (this.troops < 1) return false;
				if (this.heap.length === 0) return false;
				const tile = this.popFrontier();
				if (territoryManager.getOwner(tile) !== targetId || !this.bordersAttacker(tile)) continue;
				if (!gameMap.getTile(tile).conquerable) continue;

				this.addNeighbors(tile);
				const terrain = terrainOf(gameMap.tileExpansionCosts[tile]);
				const defender = this.target ? this.target : null;
				const result = attackLogic({
					terrain,
					attackTroops: this.troops,
					attackerIsBot: this.player.isBot(),
					attackerIsHumanOrNation: !this.player.isBot(),
					attackerTiles: this.player.getTerritorySize(),
					defender: defender
						? {isBot: defender.isBot(), tiles: Math.max(1, defender.getTerritorySize()), troops: defender.getTroops()}
						: null,
					borderSize: Math.max(1, this.frontier.size),
				});
				budget -= result.tickFraction;
				this.troops -= result.attackerTroopLoss;
				if (defender) defender.removeTroops(result.defenderTroopLoss);
				territoryManager.conquer(tile, this.player.id, transaction);
			}
			return this.troops >= 1 && this.heap.length > 0;
		} finally {
			transaction.apply();
			if (this.target && this.target.getTroops() < 1) convertEnclaves(this.target);
		}
	}

	/** A tile was added to the attacker's territory (possibly by another attack): its target neighbours join the frontier. */
	handlePlayerTileAdd(tile: number) {
		this.addNeighbors(tile);
	}

	/** A tile of the target appeared; it joins the frontier if it borders the attacker. */
	handleTargetTileAdd(tile: number) {
		if (bordersTile(tile, this.player.id)) this.addFrontier(tile);
	}

	/** Adds every target tile around `tile` to the frontier. */
	private addNeighbors(tile: number) {
		const targetId = this.target ? this.target.id : territoryManager.OWNER_NONE;
		const w = gameMap.width;
		const x = tile % w;
		const y = Math.floor(tile / w);
		if (x > 0 && territoryManager.getOwner(tile - 1) === targetId) this.addFrontier(tile - 1);
		if (x < w - 1 && territoryManager.getOwner(tile + 1) === targetId) this.addFrontier(tile + 1);
		if (y > 0 && territoryManager.getOwner(tile - w) === targetId) this.addFrontier(tile - w);
		if (y < gameMap.height - 1 && territoryManager.getOwner(tile + w) === targetId) this.addFrontier(tile + w);
	}

	/** Puts one target tile into the frontier with its priority. */
	private addFrontier(tile: number) {
		if (this.frontier.has(tile)) return;
		const targetId = this.target ? this.target.id : territoryManager.OWNER_NONE;
		if (territoryManager.getOwner(tile) !== targetId || !gameMap.getTile(tile).conquerable) return;
		const w = gameMap.width;
		const x = tile % w;
		const y = Math.floor(tile / w);
		let ownedByMe = 0;
		if (x > 0 && territoryManager.getOwner(tile - 1) === this.player.id) ownedByMe++;
		if (x < w - 1 && territoryManager.getOwner(tile + 1) === this.player.id) ownedByMe++;
		if (y > 0 && territoryManager.getOwner(tile - w) === this.player.id) ownedByMe++;
		if (y < gameMap.height - 1 && territoryManager.getOwner(tile + w) === this.player.id) ownedByMe++;
		const terrain = terrainOf(gameMap.tileExpansionCosts[tile]);
		const pri = (10 + random.nextInt(3)) * (1 + terrainPriorityBonus(terrain) / 2) * (1 - 0.1 * ownedByMe) + gameTicker.getTickCount();
		this.frontier.add(tile);
		this.pushFrontier({tile, pri});
	}

	private bordersAttacker(tile: number): boolean {
		return bordersTile(tile, this.player.id);
	}

	private pushFrontier(item: {tile: number; pri: number}) {
		const h = this.heap;
		h.push(item);
		let i = h.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (h[parent].pri <= h[i].pri) break;
			[h[parent], h[i]] = [h[i], h[parent]];
			i = parent;
		}
	}

	private popFrontier(): number {
		const h = this.heap;
		const top = h[0];
		const last = h.pop() as {tile: number; pri: number};
		if (h.length > 0) {
			h[0] = last;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < h.length && h[l].pri < h[m].pri) m = l;
				if (r < h.length && h[r].pri < h[m].pri) m = r;
				if (m === i) break;
				[h[m], h[i]] = [h[i], h[m]];
				i = m;
			}
		}
		this.frontier.delete(top.tile);
		return top.tile;
	}
}
