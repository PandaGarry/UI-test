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
import {decodeMap} from "@frontline/core/map/codec/MapCodec";
import {GameMap} from "@frontline/core/map/GameMap";
import {startGame} from "@frontline/core/game/Game";
import {gameModeFromId} from "@frontline/core/game/mode/GameModeRegistry";
import {gameTicker} from "@frontline/core/game/GameTicker";
import {BalanceConfig} from "@frontline/core/game/BalanceConfig";
import {attackActionHandler} from "@frontline/core/game/attack/AttackActionHandler";
import {playerManager} from "@frontline/core/game/player/PlayerManager";
import {spawnManager} from "@frontline/core/game/player/SpawnManager";
import {largestPlayers} from "@frontline/core/game/GameStats";
import {territoryManager} from "@frontline/core/game/TerritoryManager";
import {borderManager} from "@frontline/core/game/BorderManager";
import {actuallyHandleAttack} from "@frontline/core/game/attack/AttackActionValidator";
import {GameModeIds} from "@frontline/core/protocol/util/GameTypeIds";
import {NATION_MANIFESTS} from "../src/app/NationManifests.gen";
import type {NationDifficulty} from "@frontline/core/game/nation/NationPlayer";
// Side-effect imports: register game mode, bot behaviours and boat ticking
// (in the browser these are loaded by the webpack module loader).
import "@frontline/core/game/mode/FFAGameMode";
import "@frontline/core/game/boat/BoatManager";
import "@frontline/core/game/bot/modifier/SimpleAttackStrategy";
import "@frontline/core/game/bot/modifier/BoatAttackStrategy";
import "@frontline/core/game/bot/modifier/BotConstraints";
import "@frontline/core/game/bot/modifier/BotTrigger";

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
const diag = process.argv.includes("--diag");
const expansionOverride = arg("expansion", "");
// Human attack scenario (docs/PARITY.md 1.5): the human keeps one attack going at a time with 20 % of its troops
// (reference default attack slider), takes unclaimed land first, otherwise the neighbour with the longest shared border.
const humanAttack = process.argv.includes("--human-attack");
const HUMAN_ATTACK_PER_MILLE = 200;
// A player does not click again at once: one second between the end of an attack and the next one.
const HUMAN_REACTION_TICKS = 10;
let humanIdleSince: number | null = null;

const loadStart = performance.now();
const map = loadMap(mapName);
console.log(`Map ${mapName} ${map.width}x${map.height} loaded in ${Math.round(performance.now() - loadStart)} ms`);

// --states: the map's states from its manifest (NATION_MANIFESTS) are added on top of the bots.
const states = process.argv.includes("--states") ? (NATION_MANIFESTS[mapName] ?? []) : [];
// --difficulty=easy|medium|hard|impossible: the states difficulty (lobby choice; bots have none).
const difficultyArg = arg("difficulty", "medium") as NationDifficulty;
startGame(map, gameModeFromId(GameModeIds.FFA), seed, [{name: "PerfHuman"}], 0, true, bots + 1, 1, states, difficultyArg);
spawnManager.randomSpawnPoint(playerManager.getPlayers()[0]);

const neutralSeries: string[] = [];
const milestones = new Map<number, number>();
// Land share (for comparison with other games on different map resolutions): land = tiles that are not water.
let landTiles = 0;
for (let i = 0; i < map.width * map.height; i++) if (!map.getTile(i).navigable) landTiles++;
const shareMilestones = new Map<number, number>();
const humanMilestones = new Map<number, number>();
const human = playerManager.getPlayers()[0];
let humanAttacks = 0;

/** One decision of the human player: start an attack when none is running. */
function humanStep(): void {
	if (!human.isAlive()) return;
	if (attackActionHandler.outgoingAttacks(human.id).length > 0) {
		humanIdleSince = null;
		return;
	}
	if (humanIdleSince === null) humanIdleSince = gameTicker.getTickCount();
	if (gameTicker.getTickCount() - humanIdleSince < HUMAN_REACTION_TICKS) return;
	humanIdleSince = null;
	const contact = new Map<number, number>();
	for (const tile of borderManager.getBorderTiles(human.id)) {
		const x = tile % map.width;
		const y = Math.floor(tile / map.width);
		const around = [x > 0 ? tile - 1 : -1, x < map.width - 1 ? tile + 1 : -1, y > 0 ? tile - map.width : -1, y < map.height - 1 ? tile + map.width : -1];
		for (const n of around) {
			if (n < 0) continue;
			const owner = territoryManager.getOwner(n);
			if (owner === human.id || !map.getTile(n).conquerable) continue;
			contact.set(owner, (contact.get(owner) ?? 0) + 1);
		}
	}
	if (contact.size === 0) return;
	const target = contact.has(territoryManager.OWNER_NONE)
		? territoryManager.OWNER_NONE
		: [...contact.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
	humanAttacks++;
	actuallyHandleAttack(human, target, HUMAN_ATTACK_PER_MILLE);
}
let totalMs = 0, maxMs = 0, over50 = 0;
const simStart = performance.now();
for (let tick = 1; tick <= ticks; tick++) {
	if (humanAttack) humanStep();
	const t0 = performance.now();
	gameTicker.stepHeadless();
	const ms = performance.now() - t0;
	totalMs += ms;
	if (ms > maxMs) maxMs = ms;
	if (ms > 50) over50++;
	// Checked every tick: sampling every 100 ticks reported all milestones at tick 100 (the leader grows faster than that).
	const top = largestPlayers[0]?.getTerritorySize() ?? 0;
	if (diag && tick % 600 === 0) {
		const ps = playerManager.getPlayers().filter(p => p.isAlive());
		const tiles = ps.reduce((a, p) => a + p.getTerritorySize(), 0);
		const troops = ps.reduce((a, p) => a + p.getTroops(), 0);
		const attacks = (attackActionHandler as unknown as {playerAttackList: unknown[][]}).playerAttackList.reduce((a, l) => a + l.length, 0);
		const lead = largestPlayers[0];
		console.log(`DIAG ticks=${gameTicker.getTickCount()} t=${tick / BalanceConfig.ticksPerSecond}s alive=${ps.length} tiles=${(tiles / landTiles * 100).toFixed(1)}% troopsPerTile=${(troops / Math.max(1, tiles)).toFixed(0)} leaderTiles=${lead?.getTerritorySize()} leaderTroops=${lead?.getTroops()} attackEntries=${attacks}`);
	}
	if ([0, 50, 100, 200, 400, 600, 800, 1200].includes(tick)) {
		let neutral = 0;
		for (let i = 0; i < map.width * map.height; i++) if (!map.getTile(i).navigable && territoryManager.getOwner(i) === territoryManager.OWNER_NONE) neutral++;
		const owned = playerManager.getPlayers().reduce((a, p) => a + p.getTerritorySize(), 0);
		neutralSeries.push(`+${tick}:${neutral}/owned=${owned}/land=${landTiles}`);
	}
	const sharePct = (top / landTiles) * 100;
	for (const m of [1, 2, 5, 10]) if (sharePct >= m && !shareMilestones.has(m)) shareMilestones.set(m, tick);
	if (humanAttack) {
		const humanPct = (human.getTerritorySize() / landTiles) * 100;
		for (const m of [1, 2, 5, 10]) if (humanPct >= m && !humanMilestones.has(m)) humanMilestones.set(m, tick);
	}
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
if (states.length > 0) {
	const nationsAlive = playerManager.getNations().filter(n => n.isAlive());
	const nationTiles = playerManager.getNations().map(n => n.getTerritorySize());
	const nationAttackTroops = nationTiles.reduce((a, b) => a + b, 0);
	console.log(`STATES alive ${nationsAlive.length}/${states.length}, tiles ${nationAttackTroops}, largest ${Math.max(0, ...nationTiles)}, average ${(nationAttackTroops / Math.max(1, states.length)).toFixed(1)}`);
}
console.log(`Leader: ${largestPlayers[0]?.name} with ${largestPlayers[0]?.getTerritorySize()} tiles`);
const secs = (m: number) => (milestones.has(m) ? (milestones.get(m)! / BalanceConfig.ticksPerSecond).toFixed(1) : "none");
const shareSecs = (m: number) => (shareMilestones.has(m) ? (shareMilestones.get(m)! / BalanceConfig.ticksPerSecond).toFixed(1) : "none");
console.log(`SHARE seed=${seed} map=${mapName} bots=${bots} botAttack=${`${BalanceConfig.botAttackMinPerMille}-${BalanceConfig.botAttackMaxPerMille}`} land=${landTiles} s1=${shareSecs(1)} s2=${shareSecs(2)} s5=${shareSecs(5)} s10=${shareSecs(10)} leaderShareEnd=${((largestPlayers[0]?.getTerritorySize() ?? 0) / landTiles * 100).toFixed(2)}% totalShareEnd=${(totalTerritory / landTiles * 100).toFixed(1)}%`);
console.log(`RESULT seed=${seed} map=${mapName} bots=${bots} botAttack=${`${BalanceConfig.botAttackMinPerMille}-${BalanceConfig.botAttackMaxPerMille}`} t100=${secs(100)} t500=${secs(500)} t1000=${secs(1000)} t2000=${secs(2000)} leaderTiles=${largestPlayers[0]?.getTerritorySize() ?? 0}`);
if (humanAttack) {
	const hs = (m: number) => (humanMilestones.has(m) ? (humanMilestones.get(m)! / BalanceConfig.ticksPerSecond).toFixed(1) : "none");
	console.log(`HUMAN seed=${seed} map=${mapName} bots=${bots} attackPerMille=${HUMAN_ATTACK_PER_MILLE} attacks=${humanAttacks} s1=${hs(1)} s2=${hs(2)} s5=${hs(5)} s10=${hs(10)} tilesEnd=${human.getTerritorySize()} alive=${human.isAlive()}`);
}
for (const [m, tick] of milestones) console.log(`Milestone: first player reached ${m} tiles at tick ${tick} (${(tick / BalanceConfig.ticksPerSecond).toFixed(1)} game-seconds)`);
const avg = totalMs / ticks;
console.log(`NEUTRAL ${neutralSeries.join(" ")}`);
console.log(`\nBudget check: avg ≤ 10 ms ${avg <= 10 ? "PASS" : "FAIL"}, max ≤ 50 ms ${maxMs <= 50 ? "PASS" : "FAIL"}`);
process.exit(avg <= 10 && maxMs <= 50 ? 0 : 1);
