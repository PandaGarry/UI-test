import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import type {TileType} from "@frontline/core/map/codec/MapCodec";
import {GameMap} from "@frontline/core/map/GameMap";
import {startGame} from "@frontline/core/game/Game";
import {gameModeFromId} from "@frontline/core/game/mode/GameModeRegistry";
import {GameModeIds} from "@frontline/core/protocol/util/GameTypeIds";
import {territoryManager} from "@frontline/core/game/TerritoryManager";
import {playerManager} from "@frontline/core/game/player/PlayerManager";
import {spawnManager} from "@frontline/core/game/player/SpawnManager";
import {BalanceConfig} from "@frontline/core/game/BalanceConfig";
import {NationPlayer, type NationSpec} from "@frontline/core/game/nation/NationPlayer";
import "@frontline/core/game/mode/FFAGameMode";
import "@frontline/core/game/boat/BoatManager";

// States (nations) on a synthetic land map: start tiles, bots kept away from them, parameter ranges.
// No map cache needed. The map is large enough for bot spawn points with a clearance around the states.

const W = 60;
const H = 60;
const PLAINS: TileType = {
	name: "Plains", colorBase: "plains", colorVariant: 0, conquerable: true, navigable: false,
	expansionTime: 50, expansionCost: 50,
};

const STATES: NationSpec[] = [
	{name: "Альфа", x: 12, y: 12},
	{name: "Бета", x: 46, y: 40},
];

function newGame(bots: number): void {
	const map = new GameMap("Synthetic", W, H, [PLAINS]);
	for (let i = 0; i < W * H; i++) map.setTileId(i, 0);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	// maxPlayerCount counts the human and the bots; the states are added on top.
	startGame(map, gameModeFromId(GameModeIds.FFA), 4242, [{name: "Human"}], 0, true, bots + 1, 1, STATES);
}

const tileOf = (spec: NationSpec) => spec.y * W + spec.x;
const distance = (a: number, b: number) => Math.hypot((a % W) - (b % W), Math.floor(a / W) - Math.floor(b / W));

describe("States (nations)", () => {
	test("each state starts on its manifest tile and owns it", () => {
		newGame(20);
		const nations = playerManager.getNations();
		strictEqual(nations.length, STATES.length);
		for (const [i, nation] of nations.entries()) {
			strictEqual(nation.name, STATES[i]!.name);
			strictEqual(nation.startTile, tileOf(STATES[i]!));
			strictEqual(territoryManager.getOwner(nation.startTile), nation.id, `${nation.name} owns its start tile`);
		}
	});

	test("states follow the human in ids, are not bots, and have no spawn immunity", () => {
		newGame(20);
		const nations = playerManager.getNations();
		for (const nation of nations) {
			ok(nation instanceof NationPlayer);
			strictEqual(nation.isBot(), false, "states are not bots (attacker is human-or-nation in AttackRules)");
			strictEqual(nation.hasSpawnImmunity(), false, "only human players have spawn immunity");
			strictEqual(playerManager.isBot(nation.id), false, "playerManager.isBot treats states as non-bots");
		}
		strictEqual(nations[0]!.id, 1, "the human has id 0, the first state id 1");
		strictEqual(nations[1]!.id, 2);
		strictEqual(playerManager.isBot(3), true, "the first bot follows the states");
	});

	test("bot spawn points keep the clearance from every state start tile", () => {
		newGame(60);
		const clearance = BalanceConfig.nationSpawnClearanceTiles;
		ok(spawnManager.spawnPoints.length > 0, "bots still have spawn points");
		for (const point of spawnManager.spawnPoints) {
			for (const spec of STATES) {
				ok(distance(point, tileOf(spec)) >= clearance, `spawn point ${point} is within ${clearance} tiles of ${spec.name}`);
			}
		}
	});

	test("state parameters are drawn inside the configured ranges", () => {
		newGame(20);
		for (const nation of playerManager.getNations()) {
			const p = nation.profile();
			const [lo, hi] = BalanceConfig.nationAttackIntervalTicks;
			ok(p.attackInterval >= lo && p.attackInterval <= hi, `interval ${p.attackInterval} in [${lo}, ${hi}]`);
			ok(p.attackPhase >= 0 && p.attackPhase < p.attackInterval, "phase inside the interval");
			const share = (v: number, [a, b]: readonly [number, number]) => v >= a / 100 && v <= b / 100;
			ok(share(p.triggerShare, BalanceConfig.nationTriggerPercent), "trigger share in range");
			ok(share(p.reserveShare, BalanceConfig.nationReservePercent), "reserve share in range");
			ok(share(p.expandShare, BalanceConfig.nationExpandPercent), "expand share in range");
		}
	});

	test("the same seed gives the same start tiles and parameters", () => {
		newGame(20);
		const first = playerManager.getNations().map(n => JSON.stringify(n.profile()));
		newGame(20);
		const second = playerManager.getNations().map(n => JSON.stringify(n.profile()));
		strictEqual(second.join("|"), first.join("|"));
	});
});
