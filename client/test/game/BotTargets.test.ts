import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import type {TileType} from "@frontline/core/map/codec/MapCodec";
import {GameMap} from "@frontline/core/map/GameMap";
import {startGame} from "@frontline/core/game/Game";
import {gameModeFromId} from "@frontline/core/game/mode/GameModeRegistry";
import {GameModeIds} from "@frontline/core/protocol/util/GameTypeIds";
import {territoryManager} from "@frontline/core/game/TerritoryManager";
import {playerManager} from "@frontline/core/game/player/PlayerManager";
import {TerritoryTransaction} from "@frontline/core/game/transaction/TerritoryTransaction";
import {type BotPlayer} from "@frontline/core/game/bot/BotPlayer";
import {priorityTarget} from "@frontline/core/game/bot/modifier/SimpleAttackStrategy";
import {retainedTroopsFor} from "@frontline/core/game/nation/NationPlayer";
import {type GameDifficulty} from "@frontline/core/game/BalanceConfig";
import "@frontline/core/game/mode/FFAGameMode";
import "@frontline/core/game/boat/BoatManager";

// Target choice of Hard and Impossible bots and the troop reserve of states, checked against the reference rules
// (AiAttackBehavior.getAttackStrategies: veryWeak, juicy, weakest; hasReserveRatioTroops). Synthetic map, no map cache.

const W = 16;
const H = 16;

const PLAINS: TileType = {
	name: "Plains", colorBase: "plains", colorVariant: 0, conquerable: true, navigable: false,
	expansionTime: 50, expansionCost: 50,
};
const WATER: TileType = {
	name: "Water", colorBase: "water", colorVariant: 0, conquerable: false, navigable: true,
	expansionTime: 50, expansionCost: 50,
};

const idx = (x: number, y: number) => y * W + x;

function block(x0: number, y0: number, x1: number, y1: number): number[] {
	const out: number[] = [];
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(idx(x, y));
	return out;
}

/** One human (id 0) and three bots (ids 1, 2, 3) of the given difficulty. */
function newGame(difficulty: GameDifficulty): void {
	const map = new GameMap("Synthetic", W, H, [PLAINS, WATER]);
	for (let i = 0; i < W * H; i++) map.setTileId(i, 0);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	startGame(map, gameModeFromId(GameModeIds.FFA), 4242, [{name: "Human"}], 0, true, 4, 1, [], difficulty);
}

function give(owner: number, tiles: number[]): void {
	const player = playerManager.getPlayer(owner);
	for (const tile of tiles) {
		const tx = new TerritoryTransaction(player, null);
		territoryManager.conquer(tile, owner, tx);
		tx.apply();
	}
}

/** Sets the troops to an exact value (addTroops and removeTroops; the cap is checked by the caller's assert). */
function setTroops(owner: number, value: number): void {
	const player = playerManager.getPlayer(owner);
	const delta = value - player.getTroops();
	if (delta > 0) player.addTroops(delta);
	else player.removeTroops(-delta);
	strictEqual(player.getTroops(), value, `troops of ${owner} could not be set to ${value} (cap ${player.troopCap()})`);
}

describe("reserve of states (retainedTroopsFor)", () => {
	test("easy and medium keep nothing back", () => {
		strictEqual(retainedTroopsFor(0, 1000), 0);
	});

	test("hard keeps 75 % of the strongest neighbour's troops", () => {
		strictEqual(retainedTroopsFor(75, 1000), 750);
	});

	test("impossible keeps 90 % of the strongest neighbour's troops", () => {
		strictEqual(retainedTroopsFor(90, 1000), 900);
	});

	test("the kept amount is rounded up", () => {
		strictEqual(retainedTroopsFor(75, 3), 3, "ceil(2.25) must be 3");
		strictEqual(retainedTroopsFor(90, 1001), 901, "ceil(900.9) must be 901");
	});

	test("no neighbour troops, nothing to keep", () => {
		strictEqual(retainedTroopsFor(90, 0), 0);
	});
});

describe("bot target choice (priorityTarget)", () => {
	test("a very weak target (under 15 % of its cap) comes first", () => {
		newGame("impossible");
		give(1, block(0, 0, 1, 1));
		give(2, block(4, 0, 9, 9));
		give(3, block(0, 6, 3, 9));
		setTroops(1, 1);
		setTroops(2, 50);
		const attacker = playerManager.getPlayer(3) as BotPlayer;
		strictEqual(priorityTarget(attacker, [1, 2]), 1);
	});

	test("when no target is juicy (all above 75 % of the attacker's troops), the lowest density wins", () => {
		newGame("hard");
		give(1, block(0, 0, 1, 1));
		give(2, block(4, 0, 9, 9));
		give(3, block(0, 6, 3, 9));
		const attacker = playerManager.getPlayer(3) as BotPlayer;
		setTroops(3, 1);
		const t1 = playerManager.getPlayer(1);
		const t2 = playerManager.getPlayer(2);
		// Both targets sit above the 15 % very-weak line and above 75 % of the attacker's 1 troop.
		setTroops(1, Math.ceil(t1.troopCap() * 0.5));
		setTroops(2, Math.ceil(t2.troopCap() * 0.5));
		const density1 = t1.getTroops() / t1.getTerritorySize();
		const density2 = t2.getTroops() / t2.getTerritorySize();
		const expected = density1 < density2 ? 1 : 2;
		strictEqual(priorityTarget(attacker, [1, 2]), expected);
	});

	test("the juiciest target is the one with the largest troop gap below its cap", () => {
		newGame("hard");
		give(1, block(0, 0, 1, 1));
		give(2, block(4, 0, 9, 9));
		give(3, block(0, 6, 3, 9));
		const attacker = playerManager.getPlayer(3) as BotPlayer;
		const t1 = playerManager.getPlayer(1);
		const t2 = playerManager.getPlayer(2);
		// Attacker strong enough that both targets are below 75 % of its troops.
		setTroops(3, attacker.troopCap());
		setTroops(1, Math.ceil(t1.troopCap() * 0.4));
		setTroops(2, Math.ceil(t2.troopCap() * 0.6));
		ok(t1.getTroops() <= attacker.getTroops() * 0.75 && t2.getTroops() <= attacker.getTroops() * 0.75, "setup: both targets must be under 75 % of the attacker");
		const gap1 = 1 - t1.getTroops() / t1.troopCap();
		const gap2 = 1 - t2.getTroops() / t2.troopCap();
		const expected = gap1 > gap2 ? 1 : 2;
		strictEqual(priorityTarget(attacker, [1, 2]), expected);
	});
});
