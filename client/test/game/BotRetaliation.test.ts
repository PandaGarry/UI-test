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
import {type GameDifficulty} from "@frontline/core/game/BalanceConfig";
import "@frontline/core/game/mode/FFAGameMode";
import "@frontline/core/game/boat/BoatManager";

// Bot retaliation by lobby difficulty, end to end on a small synthetic map (no map cache needed).
// The rules are the reference ones (AiAttackBehavior.retaliate, ported as BotPlayer.retaliate):
//   Easy: never retaliates; Hard and Impossible: retaliate on the first tick; Medium: after the cooldown (not tested here).
// The human (id 0) attacks bot 1; the bot's own tick decides whether it attacks back.

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

const idx = (x: number, y: number) => y * W + x;

function block(x0: number, y0: number, x1: number, y1: number): number[] {
	const out: number[] = [];
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(idx(x, y));
	return out;
}

/** One human (id 0) and two bots (ids 1 and 2) of the given difficulty. */
function newGame(difficulty: GameDifficulty): void {
	const map = new GameMap("Synthetic", W, H, [PLAINS, WATER]);
	for (let i = 0; i < W * H; i++) map.setTileId(i, 0);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	startGame(map, gameModeFromId(GameModeIds.FFA), 4242, [{name: "Human"}], 0, true, 3, 1, [], difficulty);
}

function give(owner: number, tiles: number[]): void {
	const player = playerManager.getPlayer(owner);
	for (const tile of tiles) {
		const tx = new TerritoryTransaction(player, null);
		territoryManager.conquer(tile, owner, tx);
		tx.apply();
	}
}

/** Human attacks bot 1 with a shared border; bot 1 gets its own ground and troops. */
function humanAttacksBot(): void {
	give(0, block(0, 0, 3, 3));
	give(1, block(4, 0, 7, 3));
	const human = playerManager.getPlayer(0);
	const bot = playerManager.getPlayer(1);
	human.addTroops(5000);
	bot.addTroops(5000);
	attackActionHandler.attackPlayer(human, bot, 1000);
}

const attacksFromBot = (botId: number, targetId: number): boolean =>
	attackActionHandler.outgoingAttacks(botId).some(attack => attack.target?.id === targetId);

describe("bot retaliation by difficulty", () => {
	test("easy bot does not attack back", () => {
		newGame("easy");
		humanAttacksBot();
		playerManager.getPlayer(1).tick();
		ok(!attacksFromBot(1, 0), "easy bot retaliated");
	});

	test("hard bot attacks back on the first tick", () => {
		newGame("hard");
		humanAttacksBot();
		playerManager.getPlayer(1).tick();
		ok(attacksFromBot(1, 0), "hard bot did not retaliate");
	});

	test("impossible bot attacks back on the first tick", () => {
		newGame("impossible");
		humanAttacksBot();
		playerManager.getPlayer(1).tick();
		ok(attacksFromBot(1, 0), "impossible bot did not retaliate");
	});

	test("a bot does not start a second attack on an attacker it already attacks", () => {
		newGame("hard");
		humanAttacksBot();
		const bot = playerManager.getPlayer(1);
		bot.tick();
		const before = attackActionHandler.outgoingAttacks(1).length;
		bot.tick();
		strictEqual(attackActionHandler.outgoingAttacks(1).length, before, "bot added a duplicate attack on the same attacker");
	});
});
