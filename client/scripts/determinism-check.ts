/**
 * Determinism check (step 4 of docs/ARCHITECTURE-PLAN-2026-10-16.md).
 * Runs a headless bot game with a fixed seed and prints a hash of the full gameplay state.
 * Two independent processes with the same arguments must print the same hash.
 *
 *   npm run gen-maps   # once
 *   npx tsx scripts/determinism-check.ts --map Europe --bots 30 --ticks 400 --seed 12345
 */
import {readFileSync} from "fs";
import {decodeMap} from "../src/map/codec/MapCodec";
import {GameMap} from "../src/map/GameMap";
import {startGame} from "../src/game/Game";
import {gameModeFromId} from "../src/game/mode/GameModeRegistry";
import {gameTicker} from "../src/game/GameTicker";
import {attackActionHandler} from "../src/game/attack/AttackActionHandler";
import {playerManager} from "../src/game/player/PlayerManager";
import {spawnManager} from "../src/game/player/SpawnManager";
import {territoryManager} from "../src/game/TerritoryManager";
import {GameModeIds} from "../src/protocol/util/GameTypeIds";
import "../src/game/mode/FFAGameMode";
import "../src/game/boat/BoatManager";
import "../src/game/bot/modifier/SimpleAttackStrategy";
import "../src/game/bot/modifier/BoatAttackStrategy";
import "../src/game/bot/modifier/BotConstraints";
import "../src/game/bot/modifier/BotTrigger";

function arg(name: string, fallback: string): string {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Same map loading as scripts/perf-sim.ts. */
function loadMap(name: string): GameMap {
	const data = new Uint8Array(readFileSync(`build/cache/${name}.mapcache`));
	let offset = 0;
	for (let s = 0; s < 6; s++) { while (data[offset] !== 0) offset++; offset++; }
	const decoded = decodeMap(data.slice(offset));
	const map = new GameMap(name, decoded.width, decoded.height, decoded.types);
	for (let i = 0; i < decoded.tiles.length; i++) map.setTileId(i, decoded.tiles[i]);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	return map;
}

/** FNV-1a over 32-bit words. */
class Fnv {
	private h = 0x811c9dc5;
	add(word: number): void {
		this.h ^= word >>> 0;
		this.h = Math.imul(this.h, 0x01000193) >>> 0;
	}
	hex(): string {
		return this.h.toString(16).padStart(8, "0");
	}
}

const mapName = arg("map", "Europe");
const bots = parseInt(arg("bots", "30"));
const ticks = parseInt(arg("ticks", "400"));
const seed = parseInt(arg("seed", "12345"));

const map = loadMap(mapName);
startGame(map, gameModeFromId(GameModeIds.FFA), seed, [{name: "CheckHuman"}], 0, true, bots + 1, 1);
spawnManager.randomSpawnPoint(playerManager.getPlayers()[0]);

for (let t = 0; t < ticks; t++) gameTicker.stepHeadless();

const fnv = new Fnv();
for (let i = 0; i < map.width * map.height; i++) fnv.add(territoryManager.getOwner(i));
for (const p of playerManager.getPlayers()) {
	fnv.add(p.id);
	fnv.add(p.getTerritorySize());
	fnv.add(Math.round(p.getTroops() * 1000));
}
const attacks = (attackActionHandler as unknown as {playerAttackList: unknown[][]}).playerAttackList;
fnv.add(attacks.reduce((a, l) => a + l.length, 0));
console.log(`STATE_HASH=${fnv.hex()} map=${mapName} bots=${bots} ticks=${gameTicker.getTickCount()} seed=${seed}`);
process.exit(0);
