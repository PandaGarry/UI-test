import {describe, test} from "node:test";
import {strictEqual, ok} from "node:assert";
import type {TileType} from "@frontline/core/map/codec/MapCodec";
import {GameMap} from "@frontline/core/map/GameMap";
import {startGame} from "@frontline/core/game/Game";
import {gameModeFromId} from "@frontline/core/game/mode/GameModeRegistry";
import {GameModeIds} from "@frontline/core/protocol/util/GameTypeIds";
import {playerManager} from "@frontline/core/game/player/PlayerManager";
import {formAlliance, donateTroops, startEmbargo, stopEmbargo} from "@frontline/core/game/relation/Diplomacy";
import {applyEmbargoRelations, handleEmbargoesToHostileNations} from "@frontline/core/game/nation/NationDiplomacy";
import {NationPlayer} from "@frontline/core/game/nation/NationPlayer";
import {BalanceConfig, type GameDifficulty} from "@frontline/core/game/BalanceConfig";
import "@frontline/core/game/mode/FFAGameMode";
import "@frontline/core/game/boat/BoatManager";

// Embargoes and troop donations (reference NationExecution.updateRelationsFromEmbargos, handleEmbargoesToHostileNations,
// DonateTroopExecution). Synthetic map; the trade part of the embargo does not exist in the game yet.

const W = 60;
const H = 60;
const PLAINS: TileType = {
	name: "Plains", colorBase: "plains", colorVariant: 0, conquerable: true, navigable: false,
	expansionTime: 50, expansionCost: 50,
};

/** Human 0, state 1 (\"Alpha\"), bots 2 and 3. */
function newGame(difficulty: GameDifficulty): NationPlayer {
	const map = new GameMap("Synthetic", W, H, [PLAINS]);
	for (let i = 0; i < W * H; i++) map.setTileId(i, 0);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	startGame(map, gameModeFromId(GameModeIds.FFA), 4242, [{name: "Human"}], 0, true, 4, 1, [{name: "Alpha", x: 1, y: 1}], difficulty);
	return playerManager.getNations()[0]!;
}

describe("manual embargo relation malus (reference updateRelationsFromEmbargos)", () => {
	test("a manual embargo lowers the state's relation once and restoring lifts it", () => {
		const state = newGame("medium");
		const human = playerManager.getPlayer(0);
		const before = state.relationValue(0);
		startEmbargo(0, 1, false);
		applyEmbargoRelations(state);
		applyEmbargoRelations(state);
		strictEqual(state.relationValue(0), before + BalanceConfig.embargoRelationMalus, "applied once, not per call");
		stopEmbargo(0, 1);
		applyEmbargoRelations(state);
		strictEqual(state.relationValue(0), before, "restored when the embargo ends");
		strictEqual(human.hasEmbargoAgainst(1), false);
	});

	test("a temporary embargo does not lower the relation", () => {
		const state = newGame("medium");
		const before = state.relationValue(0);
		startEmbargo(0, 1, true);
		applyEmbargoRelations(state);
		strictEqual(state.relationValue(0), before);
	});
});

describe("states start and end their embargoes (reference handleEmbargoesToHostileNations)", () => {
	test("a hostile state starts a manual embargo and ends it once relations recover on Easy", () => {
		const state = newGame("easy");
		state.updateRelation(0, -60);
		handleEmbargoesToHostileNations(state);
		strictEqual(playerManager.getPlayer(1).hasManualEmbargoAgainst(0), true);
		state.updateRelation(0, 60); // from -60 to 0: Distrustful, still below Neutral
		state.updateRelation(0, 60); // to 60: Friendly
		handleEmbargoesToHostileNations(state);
		strictEqual(state.hasEmbargoAgainst(0), false, "Easy ends the embargo once the relation is Friendly");
	});

	test("on Hard the embargo does not end at Neutral but ends at Friendly", () => {
		const state = newGame("hard");
		state.updateRelation(0, -60);
		handleEmbargoesToHostileNations(state);
		state.updateRelation(0, 60); // Distrustful
		state.updateRelation(0, 60); // Friendly
		handleEmbargoesToHostileNations(state);
		strictEqual(state.hasEmbargoAgainst(0), false);
	});

	test("on Impossible the embargo never ends by relation", () => {
		const state = newGame("impossible");
		state.updateRelation(0, -60);
		handleEmbargoesToHostileNations(state);
		state.updateRelation(0, 100);
		handleEmbargoesToHostileNations(state);
		strictEqual(state.hasEmbargoAgainst(0), true);
	});
});

describe("troop donations (reference DonateTroopExecution)", () => {
	test("only an ally can receive troops", () => {
		newGame("medium");
		const moved = donateTroops(0, 1, 100, 1000);
		strictEqual(moved, 0);
	});

	test("a donation moves troops, is cut to the recipient's room and starts the cooldown", () => {
		newGame("medium");
		ok(formAlliance(0, 1, 0));
		const human = playerManager.getPlayer(0);
		const state = playerManager.getPlayer(1);
		human.addTroops(10_000_000);
		state.removeTroops(state.getTroops());
		const room = state.troopCap();
		const sent = donateTroops(0, 1, room * 2, 1000);
		strictEqual(sent, Math.floor(room), "the donation is cut to the room");
		strictEqual(donateTroops(0, 1, 10, 1000 + BalanceConfig.donateCooldownTicks - 1), 0, "cooldown");
	});

	test("a donation of a large part of the cap raises the recipient's relation toward the sender", () => {
		newGame("impossible");
		formAlliance(0, 1, 0);
		const state = playerManager.getPlayer(1);
		const human = playerManager.getPlayer(0);
		human.addTroops(10_000_000);
		state.removeTroops(state.getTroops());
		state.updateRelation(0, -state.relationValue(0)); // the alliance raised it to 100; start from 0
		donateTroops(0, 1, state.troopCap() / 2, 0);
		strictEqual(state.relationValue(0), BalanceConfig.donationRelation);
	});

	test("a small donation moves troops but gives no relation", () => {
		newGame("medium");
		formAlliance(0, 1, 0);
		const state = playerManager.getPlayer(1);
		playerManager.getPlayer(0).addTroops(10_000_000);
		state.removeTroops(state.getTroops());
		const before = state.relationValue(0);
		strictEqual(donateTroops(0, 1, 1, 0), 1);
		strictEqual(state.relationValue(0), before);
	});
});
