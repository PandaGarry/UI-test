/**
 * Headless performance / balance simulation (bot-vs-bot, no browser).
 *
 * Runs a local game directly on the simulation modules and measures tick
 * times, so balance and performance changes are verified with numbers:
 *
 *   npm run gen-maps   # once, generates build/cache/*.mapcache
 *   npm run perf -- --map Europe --bots 30 --ticks 1200
 *
 * Budgets (see docs/VISION.md): avg tick ≤ 10 ms, worst tick ≤ 50 ms
 * on the reference scenario World × 120 bots.
 */
import {readFileSync} from "fs";
import {decodeMap} from "../src/map/codec/MapCodec";
import {GameMap} from "../src/map/GameMap";
import {startGame} from "../src/game/Game";
import {gameModeFromId} from "../src/game/mode/GameModeRegistry";
import {gameTicker} from "../src/game/GameTicker";
import {BalanceConfig} from "../src/game/BalanceConfig";
import {playerManager} from "../src/game/player/PlayerManager";
import {spawnManager} from "../src/game/player/SpawnManager";
import {largestPlayers} from "../src/game/GameStats";
import {GameModeIds} from "../src/network/protocol/util/GameTypeIds";
// Side-effect imports: register game mode, bot behaviours and boat ticking
// (in the browser these are loaded by the webpack module loader).
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

function loadMap(name: string): GameMap {
	let data: Uint8Array;
	try {
		data = new Uint8Array(readFileSync(`build/cache/${name}.mapcache`));
	} catch {
		throw new Error(`Map cache for ${name} not found. Run: npm run gen-maps`);
	}
	let offset = 0; // skip 6 zero-terminated header strings (name + author)
	for (let s = 0; s < 6; s++) { while (data[offset] !== 0) offset++; offset++; }
	const decoded = decodeMap(data.slice(offset));
	const map = new GameMap(name, decoded.width, decoded.height, decoded.types);
	for (let i = 0; i < decoded.tiles.length; i++) map.setTileId(i, decoded.tiles[i]);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	return map;
}

const mapName = arg("map", "Europe");
const bots = parseInt(arg("bots", "30"));
const ticks = parseInt(arg("ticks", "1200"));
const seed = parseInt(arg("seed", "23452345"));
// Calibration override: scales expansion delays for this run only (the default lives in BalanceConfig).
const expansionOverride = arg("expansion", "");
if (expansionOverride) (BalanceConfig as {expansionDelayFactor: number}).expansionDelayFactor = Number(expansionOverride);

const loadStart = performance.now();
const map = loadMap(mapName);
console.log(`Map ${mapName} ${map.width}x${map.height} loaded in ${Math.round(performance.now() - loadStart)} ms`);

startGame(map, gameModeFromId(GameModeIds.FFA), seed, [{name: "PerfHuman"}], 0, true, bots + 1, 1);
spawnManager.randomSpawnPoint(playerManager.getPlayers()[0]);

const milestones = new Map<number, number>();
let totalMs = 0, maxMs = 0, over50 = 0;
const simStart = performance.now();
for (let tick = 1; tick <= ticks; tick++) {
	const t0 = performance.now();
	gameTicker.registry.broadcast();
	const ms = performance.now() - t0;
	totalMs += ms;
	if (ms > maxMs) maxMs = ms;
	if (ms > 50) over50++;
	// Checked every tick: sampling every 100 ticks reported all milestones at tick 100 (the leader grows faster than that).
	const top = largestPlayers[0]?.getTerritorySize() ?? 0;
	for (const m of [100, 500, 1000, 2000]) {
		if (top >= m && !milestones.has(m)) milestones.set(m, tick);
	}
}
const wallMs = performance.now() - simStart;
const players = playerManager.getPlayers();
const alive = players.filter(p => p.isAlive()).length;
const totalTerritory = players.reduce((a, p) => a + p.getTerritorySize(), 0);

console.log(`\n=== Perf simulation: ${mapName}, ${bots} bots, ${ticks} ticks (seed ${seed}) ===`);
console.log(`Tick time: avg ${(totalMs / ticks).toFixed(2)} ms, max ${maxMs.toFixed(2)} ms, ticks >50 ms: ${over50}`);
console.log(`Throughput: ${Math.round(ticks / (wallMs / 1000))} ticks/s (real-time needs ${BalanceConfig.ticksPerSecond})`);
console.log(`Players alive: ${alive}/${players.length}, occupied tiles: ${totalTerritory}`);
console.log(`Leader: ${largestPlayers[0]?.name} with ${largestPlayers[0]?.getTerritorySize()} tiles`);
const secs = (m: number) => (milestones.has(m) ? (milestones.get(m)! / BalanceConfig.ticksPerSecond).toFixed(1) : "none");
console.log(`RESULT seed=${seed} map=${mapName} bots=${bots} expansion=${BalanceConfig.expansionDelayFactor} t100=${secs(100)} t500=${secs(500)} t1000=${secs(1000)} t2000=${secs(2000)} leaderTiles=${largestPlayers[0]?.getTerritorySize() ?? 0}`);
for (const [m, tick] of milestones) console.log(`Milestone: first player reached ${m} tiles at tick ${tick} (${(tick / BalanceConfig.ticksPerSecond).toFixed(1)} game-seconds)`);
const avg = totalMs / ticks;
console.log(`\nBudget check: avg ≤ 10 ms ${avg <= 10 ? "PASS" : "FAIL"}, max ≤ 50 ms ${maxMs <= 50 ? "PASS" : "FAIL"}`);
process.exit(avg <= 10 && maxMs <= 50 ? 0 : 1);
