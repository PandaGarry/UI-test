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
import {attackActionHandler} from "../src/game/attack/AttackActionHandler";
import {playerManager} from "../src/game/player/PlayerManager";
import {spawnManager} from "../src/game/player/SpawnManager";
import {largestPlayers} from "../src/game/GameStats";
import {territoryManager} from "../src/game/TerritoryManager";
import {borderManager} from "../src/game/BorderManager";
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
const ticks = parseInt(arg("ticks", "600"));
const seed = parseInt(arg("seed", "1"));
const map = loadMap(mapName);
startGame(map, gameModeFromId(GameModeIds.FFA), seed, [{name: "Check"}], 0, true, bots + 1, 1);
spawnManager.randomSpawnPoint(playerManager.getPlayers()[0]);

// Invariant: a player's border set must equal its owned tiles that have at least one neighbour not owned by it.
// Map edges count as open sides (the reference rule: a tile is interior only with four owned neighbours).
function isOpen(tile: number, owner: number): boolean {
	const w = map.width, x = tile % w, y = Math.floor(tile / w);
	if (x === 0 || y === 0 || x === w - 1 || y === map.height - 1) return true;
	return territoryManager.getOwner(tile - 1) !== owner || territoryManager.getOwner(tile + 1) !== owner ||
		territoryManager.getOwner(tile - w) !== owner || territoryManager.getOwner(tile + w) !== owner;
}

function check(): {extra: number; missing: number} {
	let extra = 0, missing = 0;
	const total = map.width * map.height;
	for (let i = 0; i < total; i++) {
		const owner = territoryManager.getOwner(i);
		if (owner >= playerManager.getPlayers().length) continue;
		const open = isOpen(i, owner);
		const inSet = borderManager.getBorderTiles(owner)?.has(i) ?? false;
		if (inSet && !open) extra++;
		if (!inSet && open) missing++;
	}
	return {extra, missing};
}

let worst = {tick: 0, extra: 0, missing: 0};
const dbg = process.argv.includes("--debug");
let firstBad = -1;
for (let t = 1; t <= ticks; t++) {
	gameTicker.stepHeadless();
	if (dbg && t <= 100) {
		const r = check();
		if (r.extra + r.missing > 0) {
			console.log(`first bad at tick ${t}: ${JSON.stringify(r)}`);
			for (const p of playerManager.getPlayers()) {
				const set = borderManager.getBorderTiles(p.id);
				if (!set) continue;
				for (const tile of set) {
					if (territoryManager.getOwner(tile) !== p.id) { console.log(`  stale border ${tile} owner=${territoryManager.getOwner(tile)} player=${p.id}`); break; }
					const nb: number[] = []; map.onNeighbors(tile, n => nb.push(territoryManager.getOwner(n)));
					if (nb.every(o => o === p.id)) { console.log(`  interior border tile ${tile} player=${p.id} grade=${(borderManager as any).tileGrades[tile]} nb=${nb}`); break; }
				}
			}
			break;
		}
	}
	if (t % 50 === 0) {
		const r = check();
		if ((r.extra + r.missing) > 0 && firstBad < 0) firstBad = t;
		if (r.extra + r.missing > worst.extra + worst.missing) worst = {tick: t, ...r};
	}
}
console.log(`BORDER-CHECK map=${mapName} bots=${bots} ticks=${ticks} firstBadTick=${firstBad} worst=${JSON.stringify(worst)}`);

// Pockets: owned tiles fully surrounded by one other player (the "dots" seen after an attack).
{
	let pockets = 0;
	const total = map.width * map.height;
	const w = map.width;
	const count = playerManager.getPlayers().length;
	for (let i = 0; i < total; i++) {
		const o = territoryManager.getOwner(i);
		if (o >= count) continue;
		const x = i % w, y = Math.floor(i / w);
		if (x === 0 || y === 0 || x === w - 1 || y === map.height - 1) continue;
		const a = territoryManager.getOwner(i - 1), b = territoryManager.getOwner(i + 1);
		const c = territoryManager.getOwner(i - w), d = territoryManager.getOwner(i + w);
		if (a === b && b === c && c === d && a !== o && a < count) pockets++;
	}
	console.log(`POCKETS enclosed-by-one-player tiles: ${pockets}`);
}
// Shape metric: border tiles per owned tile for the largest player (lower = compact blob, higher = web/fingers).
const leader = playerManager.getPlayers().reduce((a, b) => (b.getTerritorySize() > a.getTerritorySize() ? b : a));
const lb = borderManager.getBorderTiles(leader.id)?.size ?? 0;
console.log(`SHAPE leader=${leader.name} tiles=${leader.getTerritorySize()} border=${lb} ratio=${(lb / Math.max(1, leader.getTerritorySize())).toFixed(3)}`);
process.exit(0);
