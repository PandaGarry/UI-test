import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import type {TileType} from "@frontline/core/map/codec/MapCodec";
import {GameMap} from "@frontline/core/map/GameMap";
import {startGame} from "@frontline/core/game/Game";
import {gameModeFromId} from "@frontline/core/game/mode/GameModeRegistry";
import {GameModeIds} from "@frontline/core/protocol/util/GameTypeIds";
import {playerManager} from "@frontline/core/game/player/PlayerManager";
import {territoryManager} from "@frontline/core/game/TerritoryManager";
import {TerritoryTransaction} from "@frontline/core/game/transaction/TerritoryTransaction";
import {allianceBook} from "@frontline/core/game/relation/Alliances";
import {formAlliance, requestAlliance} from "@frontline/core/game/relation/Diplomacy";
import {juiciestAlly, maybeBetray} from "@frontline/core/game/nation/NationDiplomacy";
import {NationPlayer} from "@frontline/core/game/nation/NationPlayer";
import {gameTicker} from "@frontline/core/game/GameTicker";
import type {GameDifficulty} from "@frontline/core/game/BalanceConfig";
import "@frontline/core/game/mode/FFAGameMode";
import "@frontline/core/game/boat/BoatManager";

// States (nations) and bots on alliance decisions (reference NationAllianceBehavior and TribeExecution).
// The betrayal and juiciness rules are deterministic, so they are tested exactly; the request answers of the bots too.
// Synthetic map, no map cache needed.

// Large enough for the spawn rules (minimum distance between the starts, see Nations.test).
const W = 60;
const H = 60;
const PLAINS: TileType = {
	name: "Plains", colorBase: "plains", colorVariant: 0, conquerable: true, navigable: false,
	expansionTime: 50, expansionCost: 50,
};

function block(x0: number, y0: number, x1: number, y1: number): number[] {
	const out: number[] = [];
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * W + x);
	return out;
}

function give(owner: number, tiles: number[]): void {
	const player = playerManager.getPlayer(owner);
	for (const tile of tiles) {
		const tx = new TerritoryTransaction(player, null);
		territoryManager.conquer(tile, owner, tx);
		tx.apply();
	}
}

/** Human 0, state 1 ("Alpha", at tile 1,1), bots 2 and 3. */
function newGame(difficulty: GameDifficulty): NationPlayer {
	const map = new GameMap("Synthetic", W, H, [PLAINS]);
	for (let i = 0; i < W * H; i++) map.setTileId(i, 0);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	startGame(map, gameModeFromId(GameModeIds.FFA), 4242, [{name: "Human"}], 0, true, 4, 1, [{name: "Alpha", x: 1, y: 1}], difficulty);
	return playerManager.getNations()[0]!;
}

describe("states betray their allies (reference maybeBetray)", () => {
	test("easy betrays a bot ally when it is at least ten times weaker", () => {
		const state = newGame("easy");
		const bot = playerManager.getPlayer(2);
		bot.removeTroops(1e9);
		formAlliance(state.id, bot.id);
		strictEqual(maybeBetray(state, [bot], []), bot.id);
		ok(!state.isAlliedWith(bot.id), "the alliance must end with the betrayal");
	});

	test("easy does not betray a weak human ally", () => {
		const state = newGame("easy");
		const human = playerManager.getPlayer(0);
		human.removeTroops(1e9);
		formAlliance(state.id, human.id);
		strictEqual(maybeBetray(state, [human], []), null);
		ok(state.isAlliedWith(human.id));
	});

	test("medium betrays a weak human ally", () => {
		const state = newGame("medium");
		const human = playerManager.getPlayer(0);
		human.removeTroops(1e9);
		formAlliance(state.id, human.id);
		strictEqual(maybeBetray(state, [human], []), human.id);
	});

	test("hard betrays its only bordering ally when it is much stronger", () => {
		const state = newGame("hard");
		const bot = playerManager.getPlayer(2);
		bot.removeTroops(1e9);
		formAlliance(state.id, bot.id);
		strictEqual(maybeBetray(state, [bot], []), bot.id);
	});

	test("hard keeps the alliance when a strong enemy borders it (the juicy-ally rule needs the surroundings to be weak)", () => {
		const state = newGame("hard");
		const bot = playerManager.getPlayer(2);
		const enemy = playerManager.getPlayer(3);
		bot.removeTroops(1e9);
		enemy.addTroops(1e9);
		formAlliance(state.id, bot.id);
		ok(enemy.getTroops() * 1 >= state.getTroops() * 0.33, "setup: the enemy must be too strong to be safe to ignore");
		strictEqual(maybeBetray(state, [bot], [enemy]), null);
		ok(state.isAlliedWith(bot.id));
	});

	test("nothing is betrayed without an alliance", () => {
		const state = newGame("easy");
		const bot = playerManager.getPlayer(2);
		bot.removeTroops(1e9);
		strictEqual(maybeBetray(state, [bot], []), null);
	});
});

describe("juiciest ally (reference findJuiciestTarget, without structures)", () => {
	test("with equal troops the ally with more tiles is the juiciest, whatever the order of the candidates", () => {
		newGame("easy");
		const a = playerManager.getPlayer(2);
		const b = playerManager.getPlayer(3);
		a.removeTroops(1e9);
		b.removeTroops(1e9);
		// Give the first bot a block of land and the second one a single tile, so the tile counts differ.
		give(a.id, block(40, 40, 45, 45));
		give(b.id, block(50, 50, 50, 50));
		ok(a.getTerritorySize() > b.getTerritorySize(), "setup: the two bots must have different tile counts");
		strictEqual(juiciestAlly([a, b]), a);
		strictEqual(juiciestAlly([b, a]), a);
	});

	test("no candidates, no juiciest ally", () => {
		strictEqual(juiciestAlly([]), null);
	});
});

describe("requests and extensions of the bots (reference TribeExecution)", () => {
	test("a bot accepts a request from a state on the next tick", () => {
		newGame("easy");
		const bot = playerManager.getPlayer(2);
		const state = playerManager.getNations()[0]!;
		strictEqual(requestAlliance(state.id, bot.id), "sent");
		playerManager.getPlayer(2).tick();
		ok(bot.isAlliedWith(state.id), "the bot did not accept");
		strictEqual(allianceBook.pendingRequest(state.id, bot.id), null);
	});

	test("a bot answers the other side's extension request with its own", () => {
		newGame("easy");
		const bot = playerManager.getPlayer(2);
		const human = playerManager.getPlayer(0);
		formAlliance(human.id, bot.id, 1000);
		const record = allianceBook.find(human.id, bot.id)!;
		const expiry = record.expiresAt;
		// Only the human asks: the bot agrees on its tick and the alliance is extended from the current tick.
		allianceBook.requestExtension(human.id, bot.id, gameTicker.getTickCount());
		bot.tick();
		strictEqual(record.expiresAt, gameTicker.getTickCount() + 3000, "the bot did not extend when asked");
		ok(record.expiresAt !== expiry);
	});

	test("a bot never sends a request itself", () => {
		newGame("easy");
		const bot = playerManager.getPlayer(2);
		for (let i = 0; i < 5; i++) bot.tick();
		strictEqual(allianceBook.pendingRequest(bot.id, 0), null);
		strictEqual(allianceBook.pendingRequest(bot.id, 1), null);
	});
});
