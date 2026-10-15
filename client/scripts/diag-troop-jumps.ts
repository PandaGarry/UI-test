// Diagnostic: finds single-tick troop jumps of the human player and attributes them.
import {readFileSync} from "fs";
import {decodeMap} from "../src/map/codec/MapCodec";
import {GameMap} from "../src/map/GameMap";
import {startGame} from "../src/game/Game";
import {gameModeFromId} from "../src/game/mode/GameModeRegistry";
import {gameTicker} from "../src/game/GameTicker";
import {playerManager} from "../src/game/player/PlayerManager";
import {spawnManager} from "../src/game/player/SpawnManager";
import {Player} from "../src/game/player/Player";
import {GameModeIds} from "../src/network/protocol/util/GameTypeIds";
import "../src/game/mode/FFAGameMode";
import "../src/game/boat/BoatManager";
import "../src/game/bot/modifier/SimpleAttackStrategy";
import "../src/game/bot/modifier/BoatAttackStrategy";
import "../src/game/bot/modifier/BotConstraints";
import "../src/game/bot/modifier/BotTrigger";

const mapName = process.argv[2] ?? "Europe";
const bots = Number(process.argv[3] ?? 30);
const seed = Number(process.argv[4] ?? 1);
const data = new Uint8Array(readFileSync(`build/cache/${mapName}.mapcache`));
let offset = 0;
for (let s = 0; s < 6; s++) { while (data[offset] !== 0) offset++; offset++; }
const decoded = decodeMap(data.slice(offset));
const map = new GameMap(mapName, decoded.width, decoded.height, decoded.types);
for (let i = 0; i < decoded.tiles.length; i++) map.setTileId(i, decoded.tiles[i]);
map.calculateAreaMap();
map.calculateDistanceMap();

let cause = "other";
const wrap = (name: string) => {
	const orig = (Player.prototype as any)[name];
	(Player.prototype as any)[name] = function (...args: any[]) {
		const before = this.getTroops();
		const prev = cause;
		cause = `${name}`;
		const r = orig.apply(this, args);
		cause = prev;
		if (this.getTroops() - before > 0) {
			lastGain = {name, delta: this.getTroops() - before, stack: new Error().stack?.split("\n").slice(2, 5).map(s => s.trim()).join(" | ")};
		}
		return r;
	};
};
let lastGain: any = null;
wrap("income"); wrap("addTroops");

startGame(map, gameModeFromId(GameModeIds.FFA), seed, [{name: "PerfHuman"}], 0, true, bots + 1, 1);
spawnManager.randomSpawnPoint(playerManager.getPlayers()[0]);
const players = playerManager.getPlayers();
const prevT = new Map(players.map(p => [p.id, p.getTroops()]));
let jumps = 0, attackReturns = 0;
const kinds = new Map<string, number>();
for (let tick = 1; tick <= 6000; tick++) {
	lastGain = null;
	gameTicker.stepHeadless();
	for (const p of playerManager.getPlayers()) {
		const prev = prevT.get(p.id) ?? 0;
		const now = p.getTroops();
		const delta = now - prev;
		if (delta > prev * 0.10 && delta > 2000 && p.isAlive() && prev > 0) {
			jumps++;
			const key = lastGain?.name === "addTroops" ? "addTroops(" + (lastGain.stack.includes("AttackActionHandler") ? "attack-return" : "other") + ")" : "income";
			kinds.set(key, (kinds.get(key) ?? 0) + 1);
			if (jumps <= 8) console.log(`JUMP tick=${tick} ${p.name} bot=${p.isBot()} ${Math.round(prev)} -> ${Math.round(now)} tiles=${p.getTerritorySize()} cap=${Math.round((p as any).troopCap())} via=${JSON.stringify(lastGain)}`);
		}
		prevT.set(p.id, now);
	}
}
console.log(`jumps>10% alive=${jumps} by cause=${JSON.stringify([...kinds])}`);
process.exit(0);
