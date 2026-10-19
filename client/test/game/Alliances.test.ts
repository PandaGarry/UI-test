import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import type {TileType} from "@frontline/core/map/codec/MapCodec";
import {GameMap} from "@frontline/core/map/GameMap";
import {startGame} from "@frontline/core/game/Game";
import {gameModeFromId} from "@frontline/core/game/mode/GameModeRegistry";
import {GameModeIds} from "@frontline/core/protocol/util/GameTypeIds";
import {playerManager} from "@frontline/core/game/player/PlayerManager";
import {allianceBook, tickAlliances} from "@frontline/core/game/relation/Alliances";
import {answerAllianceRequest, formAlliance, requestAlliance, requestAllianceExtension} from "@frontline/core/game/relation/Diplomacy";
import {BalanceConfig} from "@frontline/core/game/BalanceConfig";
import "@frontline/core/game/mode/FFAGameMode";
import "@frontline/core/game/boat/BoatManager";

// Alliance requests, answers, timeout, cooldown, expiry and extension (reference AllianceRequestExecution,
// AllianceExtensionExecution, PlayerExecution expiry, AllianceImpl). Ticks are explicit in every call: no game clock.

const W = 8;
const H = 8;
const PLAINS: TileType = {
	name: "Plains", colorBase: "plains", colorVariant: 0, conquerable: true, navigable: false,
	expansionTime: 50, expansionCost: 50,
};

function newGame(): void {
	const map = new GameMap("Synthetic", W, H, [PLAINS]);
	for (let i = 0; i < W * H; i++) map.setTileId(i, 0);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	// One human (0) and two bots (1, 2): enough ids for a pair of alliances.
	startGame(map, gameModeFromId(GameModeIds.FFA), 4242, [{name: "Human"}], 0, true, 3, 1, [], "easy");
}

const players = () => playerManager.getPlayers();

describe("alliance requests", () => {
	test("a request is pending until it is answered", () => {
		newGame();
		strictEqual(requestAlliance(0, 1, 100), "sent");
		ok(allianceBook.pendingRequest(0, 1) !== null);
		strictEqual(allianceBook.incomingRequests(1).length, 1);
		ok(!playerManager.getPlayer(0).isAlliedWith(1));
	});

	test("a second request to the same player while one is pending is refused", () => {
		newGame();
		strictEqual(requestAlliance(0, 1, 100), "sent");
		strictEqual(requestAlliance(0, 1, 101), "refused");
	});

	test("a request to oneself is refused", () => {
		newGame();
		strictEqual(requestAlliance(0, 0, 100), "refused");
	});

	test("the recipient accepts: an alliance forms and the relations rise", () => {
		newGame();
		requestAlliance(0, 1, 100);
		ok(answerAllianceRequest(1, 0, true, 110));
		ok(playerManager.getPlayer(0).isAlliedWith(1));
		ok(playerManager.getPlayer(1).isAlliedWith(0));
		strictEqual(playerManager.getPlayer(0).relationValue(1), BalanceConfig.allianceFormRelation);
		strictEqual(allianceBook.pendingRequest(0, 1), null, "an answered request is no longer pending");
	});

	test("the recipient rejects: nothing forms and the sender may ask again after the cooldown", () => {
		newGame();
		requestAlliance(0, 1, 100);
		ok(answerAllianceRequest(1, 0, false, 110));
		ok(!playerManager.getPlayer(0).isAlliedWith(1));
		strictEqual(requestAlliance(0, 1, 120), "refused", "cooldown after a rejected request");
		strictEqual(requestAlliance(0, 1, 100 + BalanceConfig.allianceRequestCooldownTicks), "sent");
	});

	test("a pending request from the other side is accepted at once when the reverse request comes", () => {
		newGame();
		requestAlliance(1, 0, 100);
		strictEqual(requestAlliance(0, 1, 105), "accepted");
		ok(playerManager.getPlayer(0).isAlliedWith(1));
		strictEqual(allianceBook.incomingRequests(0).length, 0, "the incoming request was used up");
	});

	test("an answer to a request that is not pending does nothing", () => {
		newGame();
		strictEqual(answerAllianceRequest(1, 0, true, 100), false);
	});

	test("a request that waits longer than the request duration is rejected by tick", () => {
		newGame();
		requestAlliance(0, 1, 100);
		const early = allianceBook.tick(100 + BalanceConfig.allianceRequestDurationTicks);
		strictEqual(early.rejected.length, 0, "rejected at the limit: the limit is inclusive");
		const late = allianceBook.tick(101 + BalanceConfig.allianceRequestDurationTicks);
		strictEqual(late.rejected.length, 1);
		strictEqual(allianceBook.incomingRequests(1).length, 0);
	});

	test("the cooldown runs from the time the request was sent", () => {
		newGame();
		requestAlliance(0, 1, 100);
		allianceBook.tick(100 + BalanceConfig.allianceRequestDurationTicks + 1);
		strictEqual(requestAlliance(0, 1, 100 + BalanceConfig.allianceRequestCooldownTicks - 1), "refused");
		strictEqual(requestAlliance(0, 1, 100 + BalanceConfig.allianceRequestCooldownTicks), "sent");
	});
});

describe("alliance expiry and extension", () => {
	test("an alliance expires silently at its expiry tick: no relation change, both sides lose the ally", () => {
		newGame();
		formAlliance(0, 1, 1000);
		const before = playerManager.getPlayer(0).relationValue(1);
		tickAlliances(1000 + BalanceConfig.allianceDurationTicks - 1, players());
		ok(playerManager.getPlayer(0).isAlliedWith(1), "still allied one tick before expiry");
		tickAlliances(1000 + BalanceConfig.allianceDurationTicks, players());
		ok(!playerManager.getPlayer(0).isAlliedWith(1));
		ok(!playerManager.getPlayer(1).isAlliedWith(0));
		strictEqual(allianceBook.find(0, 1), null);
		ok(playerManager.getPlayer(0).relationValue(1) <= before, "expiry must not raise the relation");
	});

	test("the prompt window opens prompt-ticks before expiry", () => {
		newGame();
		formAlliance(0, 1, 1000);
		const record = allianceBook.find(0, 1)!;
		ok(!allianceBook.extensionOpen(record, record.expiresAt - BalanceConfig.allianceExtensionPromptTicks - 1));
		ok(allianceBook.extensionOpen(record, record.expiresAt - BalanceConfig.allianceExtensionPromptTicks));
	});

	test("one side's extension request does not extend; both sides' requests extend by the alliance duration", () => {
		newGame();
		formAlliance(0, 1, 1000);
		const record = allianceBook.find(0, 1)!;
		const expiry = record.expiresAt;
		strictEqual(requestAllianceExtension(0, 1, expiry - 10), "requested");
		strictEqual(record.expiresAt, expiry, "a single request must not move the expiry");
		strictEqual(requestAllianceExtension(1, 0, expiry - 5), "extended");
		strictEqual(record.expiresAt, expiry - 5 + BalanceConfig.allianceDurationTicks);
	});

	test("an extension request without an alliance does nothing", () => {
		newGame();
		strictEqual(requestAllianceExtension(0, 1, 100), null);
	});

	test("a player out of the game loses its alliances silently and the other side drops the ally", () => {
		newGame();
		formAlliance(0, 1, 1000);
		const ownerLost: [number, number][] = [];
		const fakePlayers = [
			{id: 0, isAlive: () => false, removeAlly: (other: number) => ownerLost.push([0, other])},
			{id: 1, isAlive: () => true, removeAlly: (other: number) => ownerLost.push([1, other])},
		];
		tickAlliances(1001, fakePlayers);
		strictEqual(allianceBook.find(0, 1), null, "the record ends with the player");
		ok(ownerLost.some(([who, other]) => who === 1 && other === 0), "the living side was not told");
	});
});
