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
import {actuallyHandleAttack} from "@frontline/core/game/attack/AttackActionValidator";
import {attackActionHandler} from "@frontline/core/game/attack/AttackActionHandler";
import {breakAlliance, formAlliance} from "@frontline/core/game/relation/Diplomacy";
import {Relation, relationFromValue} from "@frontline/core/game/relation/Relation";
import {type GameDifficulty} from "@frontline/core/game/BalanceConfig";
import {gameMode} from "@frontline/core/game/GameData";
import "@frontline/core/game/mode/FFAGameMode";
import "@frontline/core/game/boat/BoatManager";

// Relations and alliances (reference PlayerImpl.relation/updateRelation/decayRelations, AllianceRequestExecution,
// BreakAllianceExecution, AttackExecution relation part). Synthetic map, no map cache needed.
// Layout: human 0 owns the top-left block, bot 1 the block to its right, bot 2 the block below the human.

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

function newGame(difficulty: GameDifficulty): void {
	const map = new GameMap("Synthetic", W, H, [PLAINS, WATER]);
	for (let i = 0; i < W * H; i++) map.setTileId(i, 0);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	startGame(map, gameModeFromId(GameModeIds.FFA), 4242, [{name: "Human"}], 0, true, 3, 1, [], difficulty);
	const give = (owner: number, tiles: number[]) => {
		const player = playerManager.getPlayer(owner);
		for (const tile of tiles) {
			const tx = new TerritoryTransaction(player, null);
			territoryManager.conquer(tile, owner, tx);
			tx.apply();
		}
	};
	give(0, block(0, 0, 3, 3));
	give(1, block(4, 0, 7, 3));
	give(2, block(0, 4, 3, 7));
	playerManager.getPlayer(0).addTroops(5000);
}

describe("relation classes", () => {
	test("thresholds follow the reference: Hostile below -50, Distrustful below 0, Neutral below 50, Friendly from 50", () => {
		strictEqual(relationFromValue(-51), Relation.Hostile);
		strictEqual(relationFromValue(-50), Relation.Distrustful);
		strictEqual(relationFromValue(-1), Relation.Distrustful);
		strictEqual(relationFromValue(0), Relation.Neutral);
		strictEqual(relationFromValue(49), Relation.Neutral);
		strictEqual(relationFromValue(50), Relation.Friendly);
	});

	test("relation values are clamped to -100..100", () => {
		newGame("easy");
		const bot = playerManager.getPlayer(1);
		bot.updateRelation(0, 250);
		strictEqual(bot.relationValue(0), 100);
		bot.updateRelation(0, -500);
		strictEqual(bot.relationValue(0), -100);
	});

	test("a relation with no history is 0 (Neutral)", () => {
		newGame("easy");
		strictEqual(playerManager.getPlayer(1).relationValue(0), 0);
		strictEqual(playerManager.getPlayer(1).relation(0), Relation.Neutral);
	});
});

describe("relation decay", () => {
	test("a positive relation moves toward 0 by the decay step", () => {
		newGame("easy");
		const bot = playerManager.getPlayer(1);
		bot.updateRelation(0, 10);
		bot.decayRelations();
		ok(Math.abs(bot.relationValue(0) - 9.95) < 1e-9, `got ${bot.relationValue(0)}`);
	});

	test("a negative relation moves toward 0 by the decay step", () => {
		newGame("easy");
		const bot = playerManager.getPlayer(1);
		bot.updateRelation(0, -10);
		bot.decayRelations();
		ok(Math.abs(bot.relationValue(0) + 9.95) < 1e-9, `got ${bot.relationValue(0)}`);
	});

	test("a value within two steps of 0 snaps to 0", () => {
		newGame("easy");
		const bot = playerManager.getPlayer(1);
		bot.updateRelation(0, 0.05);
		bot.decayRelations();
		strictEqual(bot.relationValue(0), 0);
	});
});

describe("attack relation cost", () => {
	test("a new attack on a player costs the defender's relation toward the attacker by the difficulty value", () => {
		newGame("medium");
		actuallyHandleAttack(playerManager.getPlayer(0), 1, 100);
		strictEqual(playerManager.getPlayer(1).relationValue(0), -70);
	});

	test("easy costs -60", () => {
		newGame("easy");
		actuallyHandleAttack(playerManager.getPlayer(0), 1, 100);
		strictEqual(playerManager.getPlayer(1).relationValue(0), -60);
	});

	test("impossible costs -100", () => {
		newGame("impossible");
		actuallyHandleAttack(playerManager.getPlayer(0), 1, 100);
		strictEqual(playerManager.getPlayer(1).relationValue(0), -100);
	});

	test("a second attack on the same target is merged and costs nothing more", () => {
		newGame("medium");
		actuallyHandleAttack(playerManager.getPlayer(0), 1, 100);
		actuallyHandleAttack(playerManager.getPlayer(0), 1, 100);
		strictEqual(playerManager.getPlayer(1).relationValue(0), -70);
		strictEqual(attackActionHandler.outgoingAttacks(0).length, 1);
	});

	test("hitting back at a player the attacker is hostile to does not anger it (not on Easy)", () => {
		newGame("hard");
		playerManager.getPlayer(1).updateRelation(0, -100);
		actuallyHandleAttack(playerManager.getPlayer(0), 1, 100);
		strictEqual(playerManager.getPlayer(1).relationValue(0), -100);
	});

	test("on Easy the same hit-back still costs relation", () => {
		newGame("easy");
		playerManager.getPlayer(1).updateRelation(0, -50);
		actuallyHandleAttack(playerManager.getPlayer(0), 1, 100);
		strictEqual(playerManager.getPlayer(1).relationValue(0), -100);
	});
});

describe("alliances", () => {
	test("forming an alliance makes both sides allies and raises both relations by 100 (clamped)", () => {
		newGame("easy");
		ok(formAlliance(0, 1));
		ok(playerManager.getPlayer(0).isAlliedWith(1));
		ok(playerManager.getPlayer(1).isAlliedWith(0));
		strictEqual(playerManager.getPlayer(0).relationValue(1), 100);
		strictEqual(playerManager.getPlayer(1).relationValue(0), 100);
		strictEqual(formAlliance(0, 1), false, "a second alliance between the same two must be refused");
	});

	test("allies cannot attack each other, in either direction", () => {
		newGame("easy");
		formAlliance(0, 1);
		ok(!gameMode.canAttack(0, 1), "human may not attack its ally");
		ok(!gameMode.canAttack(1, 0), "ally may not attack the human");
		ok(gameMode.canAttack(0, 2), "a player that is not an ally can still be attacked");
	});

	test("a bot does not retaliate against a player it has become allied with", () => {
		newGame("hard");
		// The human attacks bot 1 first (the attack was legal then), and the two then form an alliance.
		attackActionHandler.attackPlayer(playerManager.getPlayer(0), playerManager.getPlayer(1), 100);
		formAlliance(0, 1);
		playerManager.getPlayer(1).tick();
		ok(!attackActionHandler.outgoingAttacks(1).some(attack => attack.target?.id === 0), "bot 1 attacked its ally");
	});

	test("breaking an alliance removes it and costs the other side 100 relation toward the breaker", () => {
		newGame("easy");
		formAlliance(0, 1);
		ok(breakAlliance(0, 1));
		ok(!playerManager.getPlayer(0).isAlliedWith(1));
		ok(!playerManager.getPlayer(1).isAlliedWith(0));
		strictEqual(playerManager.getPlayer(1).relationValue(0), 0, "100 from forming, minus 100 from breaking");
		strictEqual(breakAlliance(0, 1), false, "breaking a non-alliance does nothing");
	});

	test("breaking an alliance costs the breaker's other neighbours 40 relation toward the breaker", () => {
		newGame("easy");
		formAlliance(0, 1);
		breakAlliance(0, 1);
		strictEqual(playerManager.getPlayer(2).relationValue(0), -40, "bot 2 borders the breaker and is not the other side");
	});
});
