/**
 * Places the states of a map on its land: reads client/resources/maps/nations/<Map>.source.json (name, lat, lon),
 * projects every capital onto the map grid and snaps it to the nearest conquerable land tile.
 * Writes client/resources/maps/nations/<Map>.nations.json (name, x, y, snapped distance).
 *
 *   npm run gen-maps            # once, builds build/cache/<Map>.mapcache
 *   npx tsx scripts/maps/build-nations.ts World
 *
 * States whose capital has no free land within SNAP_RADIUS tiles (about one degree on World) are reported and left out.
 */
import {readFileSync, writeFileSync} from "fs";
import {decodeMap} from "@frontline/core/map/codec/MapCodec";
import {GameMap} from "@frontline/core/map/GameMap";

const SNAP_RADIUS = 6;

function loadMap(name: string): GameMap {
	const data = new Uint8Array(readFileSync(`build/cache/${name}.mapcache`));
	let offset = 0; // skip 6 zero-terminated header strings (name + author)
	for (let s = 0; s < 6; s++) {
		while (data[offset] !== 0) offset++;
		offset++;
	}
	const decoded = decodeMap(data.slice(offset));
	const map = new GameMap(name, decoded.width, decoded.height, decoded.types);
	for (let i = 0; i < decoded.tiles.length; i++) map.setTileId(i, decoded.tiles[i]);
	map.calculateAreaMap();
	map.calculateDistanceMap();
	return map;
}

type Source = {map: string; nations: {name: string; lat: number; lon: number}[]};

const mapName = process.argv[2] ?? "World";
const source = JSON.parse(readFileSync(`resources/maps/nations/${mapName}.source.json`, "utf8")) as Source;
const map = loadMap(mapName);
const w = map.width;
const h = map.height;

const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && map.getTile(y * w + x).conquerable;

const placed: {name: string; x: number; y: number; snapped: number}[] = [];
const missed: string[] = [];
const taken = new Map<number, string>();

for (const n of source.nations) {
	const x0 = Math.round(((n.lon + 180) / 360) * w);
	const y0 = Math.round(((90 - n.lat) / 180) * h);
	let found: {x: number; y: number; d: number} | null = null;
	for (let d = 0; d <= SNAP_RADIUS && !found; d++) {
		for (let dy = -d; dy <= d && !found; dy++) {
			for (let dx = -d; dx <= d; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
				if (isLand(x0 + dx, y0 + dy) && !taken.has((y0 + dy) * w + x0 + dx)) {
					found = {x: x0 + dx, y: y0 + dy, d};
					break;
				}
			}
		}
	}
	if (!found) {
		missed.push(n.name);
		continue;
	}
	taken.set(found.y * w + found.x, n.name);
	placed.push({name: n.name, x: found.x, y: found.y, snapped: found.d});
}

const output = {
	map: mapName,
	width: w,
	height: h,
	snapRadius: SNAP_RADIUS,
	nations: placed,
};
writeFileSync(`resources/maps/nations/${mapName}.nations.json`, JSON.stringify(output, null, 1) + "\n");

const moved = placed.filter(p => p.snapped > 0);
console.log(`${mapName}: placed ${placed.length} of ${source.nations.length}; snapped ${moved.length} (max ${Math.max(0, ...placed.map(p => p.snapped))} tiles)`);
for (const p of moved.filter(p => p.snapped > 4)) console.log(`far snap: ${p.name} +${p.snapped} tiles`);
if (missed.length > 0) console.log(`not placed: ${missed.join(", ")}`);
