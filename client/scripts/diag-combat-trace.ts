// Diagnostic: traces one fight (defender troops, attack troops, attacker troops and tiles per tick).
import {readFileSync} from "fs";
import {decodeMap} from "../src/map/codec/MapCodec";
import {GameMap} from "../src/map/GameMap";
import {startGame} from "../src/game/Game";
import {gameModeFromId} from "../src/game/mode/GameModeRegistry";
import {gameTicker} from "../src/game/GameTicker";
import {attackActionHandler} from "../src/game/attack/AttackActionHandler";
import {playerManager} from "../src/game/player/PlayerManager";
import {spawnManager} from "../src/game/player/SpawnManager";
import {GameModeIds} from "../src/network/protocol/util/GameTypeIds";
import "../src/game/mode/FFAGameMode";
import "../src/game/boat/BoatManager";
import "../src/game/bot/modifier/SimpleAttackStrategy";
import "../src/game/bot/modifier/BoatAttackStrategy";
import "../src/game/bot/modifier/BotConstraints";
import "../src/game/bot/modifier/BotTrigger";

const mapName = process.argv[2] ?? "World";
const bots = Number(process.argv[3] ?? 50);
const seed = Number(process.argv[4] ?? 1);
const data = new Uint8Array(readFileSync(`build/cache/${mapName}.mapcache`));
let offset = 0;
for (let s = 0; s < 6; s++) { while (data[offset] !== 0) offset++; offset++; }
const decoded = decodeMap(data.slice(offset));
const map = new GameMap(mapName, decoded.width, decoded.height, decoded.types);
for (let i = 0; i < decoded.tiles.length; i++) map.setTileId(i, decoded.tiles[i]);
map.calculateAreaMap();
map.calculateDistanceMap();

startGame(map, gameModeFromId(GameModeIds.FFA), seed, [{name: "PerfHuman"}], 0, true, bots + 1, 1);
spawnManager.randomSpawnPoint(playerManager.getPlayers()[0]);
const handler = attackActionHandler as any;
let traced: {attack: any} | null = null;
let traceTicks = 0;
for (let tick = 1; tick <= 6000 && traceTicks < 60; tick++) {
	gameTicker.stepHeadless();
	if (!traced) {
		for (const p of playerManager.getPlayers()) {
			if (!p.isAlive()) continue;
			const a = (handler.incomingAttacks(p.id) as any[]).find(x => x.getTroops() >= 10000 && p.getTroops() >= 50000 && x.target === p);
			if (a) {
				traced = {attack: a};
				console.log(`TRACE START tick=${gameTicker.getTickCount()} def=${p.name} defTroops=${p.getTroops().toFixed(0)} defTiles=${p.getTerritorySize()} attacker=${a.player.name} attackTroops=${a.getTroops()} attackerTroops=${a.player.getTroops().toFixed(0)} attackerTiles=${a.player.getTerritorySize()}`);
				break;
			}
		}
		continue;
	}
	const a = traced.attack;
	traceTicks++;
	const alive = handler.attacks.includes(a);
	console.log(`TRACE tick=${gameTicker.getTickCount()} defTroops=${a.target.getTroops().toFixed(0)} defTiles=${a.target.getTerritorySize()} attackTroops=${alive ? a.getTroops() : "ended"} attackerTroops=${a.player.getTroops().toFixed(0)} attackerTiles=${a.player.getTerritorySize()} active=${alive}`);
}

// Per-attack accounting over 1500 ticks: attacker spend per captured target tile (same metric as the reference probe).
{
	let spend = 0, tiles = 0, samples = 0;
	const last = new Map<any, {troops: number; tiles: number}>();
	const bins = new Map<string, {n: number; tiles: number; spend: number}>();
	let launches = 0, unclaimedLaunches = 0; const seenA = new Set<any>();
	for (let t = 0; t < 3000; t++) {
		gameTicker.stepHeadless();
		for (const a of handler.attacks as any[]) if (a.target && !seenA.has(a)) { seenA.add(a); launches++; }
		for (const a of handler.attacks as any[]) if (!a.target && !seenA.has(a)) { seenA.add(a); unclaimedLaunches++; }
	}
	console.log(`FREQ ours unclaimedLaunches=${unclaimedLaunches} attacksLaunched=${launches} ticks=3000 players=${playerManager.getPlayers().filter(p => p.isAlive()).length} launchesPerPlayerPer100Ticks=${(launches / playerManager.getPlayers().filter(p => p.isAlive()).length / 30).toFixed(2)}`);
	for (let t = 0; t < 1500; t++) {
		gameTicker.stepHeadless();
		const now = new Set<any>();
		for (const a of handler.attacks as any[]) {
			if (!a.target) continue;
			now.add(a);
			const cur = {troops: a.getTroops(), tiles: a.target.getTerritorySize()};
			const prev = last.get(a);
			if (prev) {
				const sp = prev.troops - cur.troops;
				const tk = prev.tiles - cur.tiles;
				if (tk > 0 && sp > 0) { spend += sp; tiles += tk; samples++; }
				const r = a.getTroops() / Math.max(1, a.target.getTroops());
				const edges = [0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2.5, 5, 1e9];
				const k = "r<" + (edges.find(x => r < x) ?? 1e9);
				const bin = bins.get(k) ?? {n: 0, tiles: 0, spend: 0};
				bin.n++; bin.tiles += Math.max(0, tk); bin.spend += Math.max(0, sp); bins.set(k, bin);
			}
			last.set(a, cur);
		}
		for (const k of [...last.keys()]) if (!now.has(k)) last.delete(k);
	}
	for (const [k, b] of bins) console.log(`BIN ${k} attackTicks=${b.n} tilesPerTick=${(b.tiles / b.n).toFixed(2)} spendPerTile=${(b.spend / Math.max(1, b.tiles)).toFixed(1)}`);
	console.log(`CAPTURE ticks=1500 samples=${samples} tilesTaken=${tiles} attackerSpend=${spend.toFixed(0)} spendPerTile=${(spend / Math.max(1, tiles)).toFixed(1)}`);
}
