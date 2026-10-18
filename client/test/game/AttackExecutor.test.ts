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
import {attackActionHandler} from "@frontline/core/game/attack/AttackActionHandler";
import {gameTicker} from "@frontline/core/game/GameTicker";
import {absorbDefeatedRemnants, frontierPriority, tickBorderSize} from "@frontline/core/game/attack/AttackExecutor";
import {isImmuneAt} from "@frontline/core/game/attack/SpawnImmunity";
import {attackLogic, largeTerritoryBonus, Terrain} from "@frontline/core/game/attack/AttackRules";
import "@frontline/core/game/mode/FFAGameMode";
import "@frontline/core/game/boat/BoatManager";

// Characterization tests of the attack executor on a small synthetic map (no map cache needed).
// They pin the CURRENT behaviour of our code. Where our behaviour is known to differ from the reference
// (docs/COMBAT-EXECUTOR-DEEP-2026-10-18.md), the test name says so; those tests are expected to change
// in stage 1 and must then be updated in the same commit as the balance change.

const W = 12;
const H = 12;

const PLAINS: TileType = {
	name: "Plains", colorBase: "plains", colorVariant: 0, conquerable: true, navigable: false,
	expansionTime: 50, expansionCost: 50,
};
const WATER: TileType = {
	name: "Water", colorBase: "water", colorVariant: 0, conquerable: false, navigable: true,
	expansionTime: 50, expansionCost: 50,
};

/** Builds a fresh game with two players (A = 0, B = 1) on an all-plains map. */
function newGame(): {a: number; b: number} {
	const map = new GameMap("Synthetic", W, H, [PLAINS, WATER]);
	for (let i = 0; i < W * H; i++) map.setTileId(i, 0);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	startGame(map, gameModeFromId(GameModeIds.FFA), 4242, [{name: "A"}, {name: "B"}], 0, true, 2, 1);
	const players = playerManager.getPlayers();
	return {a: players[0].id, b: players[1].id};
}

function give(owner: number, tiles: number[]): void {
	const player = playerManager.getPlayer(owner);
	for (const tile of tiles) {
		const tx = new TerritoryTransaction(player, null);
		territoryManager.conquer(tile, owner, tx);
		tx.apply();
	}
}

const idx = (x: number, y: number) => y * W + x;

function block(x0: number, y0: number, x1: number, y1: number): number[] {
	const out: number[] = [];
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(idx(x, y));
	return out;
}

describe("AttackExecutor (characterization)", () => {
	test("an attack on unclaimed land conquers tiles and spends troops", () => {
		const {a} = newGame();
		give(a, block(3, 3, 5, 5));
		const player = playerManager.getPlayer(a);
		player.addTroops(1000);
		const before = player.getTerritorySize();
		const troopsBefore = player.getTroops();
		attackActionHandler.attackUnclaimed(player, 200);
		attackActionHandler.tick();
		ok(player.getTerritorySize() > before, "no tile was conquered");
		ok(player.getTroops() < troopsBefore + 200, "attacker troops were not spent");
	});

	test("an attack with fewer than one troop conquers nothing", () => {
		const {a} = newGame();
		give(a, block(3, 3, 5, 5));
		const player = playerManager.getPlayer(a);
		const before = player.getTerritorySize();
		attackActionHandler.attackUnclaimed(player, 0.5);
		attackActionHandler.tick();
		strictEqual(player.getTerritorySize(), before);
	});

	test("a second attack on the same target is merged into the first (troops added)", () => {
		const {a, b} = newGame();
		give(a, block(0, 0, 2, 2));
		give(b, block(3, 0, 5, 2));
		const pa = playerManager.getPlayer(a);
		const pb = playerManager.getPlayer(b);
		attackActionHandler.attackPlayer(pa, pb, 100);
		attackActionHandler.attackPlayer(pa, pb, 50);
		strictEqual(attackActionHandler.outgoingAttacks(a).length, 1);
		strictEqual(attackActionHandler.outgoingAttacks(a)[0].getTroops(), 150);
	});

	test("an opposing attack cancels the smaller one (attacker side)", () => {
		const {a, b} = newGame();
		give(a, block(0, 0, 2, 2));
		give(b, block(3, 0, 5, 2));
		const pa = playerManager.getPlayer(a);
		const pb = playerManager.getPlayer(b);
		attackActionHandler.attackPlayer(pb, pa, 300);
		attackActionHandler.attackPlayer(pa, pb, 100);
		strictEqual(attackActionHandler.outgoingAttacks(a).length, 0, "the smaller attack must be gone");
		const left = attackActionHandler.outgoingAttacks(b);
		strictEqual(left.length, 1);
		strictEqual(left[0].getTroops(), 200);
	});

	test("retreat from a player: nothing returns for 20 ticks, then 75 % of the troops come back", () => {
		const {a, b} = newGame();
		give(a, block(0, 0, 2, 2));
		give(b, block(3, 0, 5, 2));
		const pa = playerManager.getPlayer(a);
		const pb = playerManager.getPlayer(b);
		pa.addTroops(1000);
		attackActionHandler.attackPlayer(pa, pb, 400);
		const attack = attackActionHandler.outgoingAttacks(a)[0];
		attackActionHandler.retreat(attack);
		// Troops regenerate during the game, so the check is on the attack itself, not on the player's total.
		for (let i = 0; i < 19; i++) {
			gameTicker.stepHeadless();
			attackActionHandler.tick();
		}
		strictEqual(attack.getTroops(), 400, "the 400 stay in the attack during the delay");
		strictEqual(attackActionHandler.outgoingAttacks(a).length, 1, "the attack is still there during the delay");
		strictEqual(attack.retreatLosses(), 100, "25 % of 400 is lost against a player");
		const beforeEnd = pa.getTroops();
		gameTicker.stepHeadless();
		attackActionHandler.tick();
		strictEqual(attackActionHandler.outgoingAttacks(a).length, 0);
		ok(pa.getTroops() - beforeEnd >= 300, "the attack returns 300 troops (regeneration can only add)");
	});

	test("retreat from unclaimed land returns all troops after 20 ticks (no malus)", () => {
		const {a} = newGame();
		give(a, block(0, 0, 2, 2));
		const pa = playerManager.getPlayer(a);
		pa.addTroops(1000);
		attackActionHandler.attackUnclaimed(pa, 400);
		const attack = attackActionHandler.outgoingAttacks(a)[0];
		attackActionHandler.retreat(attack);
		strictEqual(attack.retreatLosses(), 0, "no malus against unclaimed land");
		for (let i = 0; i < 20; i++) {
			gameTicker.stepHeadless();
			attackActionHandler.tick();
		}
		strictEqual(attackActionHandler.outgoingAttacks(a).length, 0, "the attack ends after the delay");
		strictEqual(attackActionHandler.outgoingAttacks(a).length, 0);
	});

	test("a new attack on the same target while retreating cancels the retreat (no troops lost)", () => {
		const {a, b} = newGame();
		give(a, block(0, 0, 2, 2));
		give(b, block(3, 0, 5, 2));
		const pa = playerManager.getPlayer(a);
		const pb = playerManager.getPlayer(b);
		attackActionHandler.attackPlayer(pa, pb, 400);
		attackActionHandler.retreat(attackActionHandler.outgoingAttacks(a)[0]);
		const attack = attackActionHandler.outgoingAttacks(a)[0];
		attackActionHandler.attackPlayer(pa, pb, 100);
		// Checked before any tick: the same attack, no longer retreating, with the 400 and the new 100 in it.
		const left = attackActionHandler.outgoingAttacks(a);
		strictEqual(left.length, 1, "still one attack");
		strictEqual(left[0], attack, "the same attack object goes on");
		strictEqual(left[0].isRetreating(), false);
		strictEqual(left[0].getTroops(), 500);
	});

	test("a defeated player with fewer than 100 tiles loses the rest of its land to the attacker", () => {
		const {a, b} = newGame();
		give(a, block(0, 0, 2, 2));
		give(b, block(3, 0, 5, 2)); // 9 tiles, below the limit
		const pa = playerManager.getPlayer(a);
		const pb = playerManager.getPlayer(b);
		pa.addTroops(1000);
		attackActionHandler.attackPlayer(pa, pb, 400);
		for (let i = 0; i < 200 && pb.getTerritorySize() > 0; i++) {
			gameTicker.stepHeadless();
			attackActionHandler.tick();
		}
		strictEqual(pb.getTerritorySize(), 0, "every tile of the defeated player changes hands");
		for (let x = 3; x <= 5; x++) for (let y = 0; y <= 2; y++) strictEqual(territoryManager.getOwner(idx(x, y)), a);
	});

	test("a player with 100 tiles or more keeps its land when it is attacked (no absorption)", () => {
		const {a, b} = newGame();
		give(a, [idx(0, 0)]);
		const big: number[] = [];
		for (let x = 2; x < 12; x++) for (let y = 0; y < 12; y++) big.push(idx(x, y)); // 120 tiles
		give(b, big);
		absorbDefeatedRemnants(playerManager.getPlayer(a), playerManager.getPlayer(b));
		strictEqual(playerManager.getPlayer(b).getTerritorySize(), 120, "absorption is only for defeated (under 100) players");
	});

	test("spawn immunity: only human players, during the spawn phase or the first 50 ticks", () => {
		strictEqual(isImmuneAt(true, true, 999), true, "spawn phase: immune");
		strictEqual(isImmuneAt(true, false, 49), true, "tick 49: immune");
		strictEqual(isImmuneAt(true, false, 50), false, "tick 50: immunity is over");
		strictEqual(isImmuneAt(false, true, 0), false, "bots and states are never immune");
	});
});

// Reference formula (AttackExecution.addNeighbors): (10 + roll) * (1 - 0.5 * owned + mag / 2) + tick.
describe("frontierPriority (reference formula, stage 1)", () => {
	test("plains, no own neighbours, roll 0: 10 * 1.5", () => {
		strictEqual(frontierPriority(1, 0, 0, 0), 15);
	});
	test("each own neighbour lowers the priority by 0.5 * (10 + roll)", () => {
		strictEqual(frontierPriority(1, 2, 0, 0), 5);
		strictEqual(frontierPriority(1, 1, 0, 0), 10);
	});
	test("mountain (mag 2) is taken later than plains with the same roll", () => {
		strictEqual(frontierPriority(2, 0, 0, 7), 34);
		ok(frontierPriority(2, 0, 0, 7) > frontierPriority(1, 0, 0, 7));
	});
	test("the tick is added once, after the terrain/owner factor", () => {
		strictEqual(frontierPriority(1, 0, 100, 0), 115);
	});
});


describe("tickBorderSize (reference: borderSize + random(0..4), stage 1)", () => {
	test("adds the drawn 0..4 to the frontier size", () => {
		strictEqual(tickBorderSize(10, 0), 10);
		strictEqual(tickBorderSize(10, 4), 14);
	});

	test("never drops below 1 (an empty frontier still has a border size of 1)", () => {
		strictEqual(tickBorderSize(0, 0), 1);
	});
});

describe("large territories (reference attackLogic, stage 1)", () => {
	test("small territories have no bonus; huge ones get the depth discount", () => {
		ok(Math.abs(largeTerritoryBonus(100, 0.7) - 1) < 0.01, "100 tiles: about 1");
		ok(largeTerritoryBonus(1_000_000, 0.7) < 0.5, "a million tiles: close to 1 - depth");
		ok(largeTerritoryBonus(1_000_000, 0.7) > 0.3 - 1e-9, "never below 1 - depth");
	});

	test("the same fight costs a huge attacker fewer troops per tile", () => {
		const fight = (attackerTiles: number) => attackLogic({
			terrain: Terrain.Plains,
			attackTroops: 1000,
			attackerIsBot: false,
			attackerIsHumanOrNation: true,
			attackerTiles,
			defender: {isBot: false, tiles: 200, troops: 1000},
			borderSize: 20,
		});
		ok(fight(1_000_000).attackerTroopLoss < fight(100).attackerTroopLoss);
		ok(fight(1_000_000).tickFraction < fight(100).tickFraction, "and it is faster to take tiles");
	});
});
