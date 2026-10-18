/**
 * Fits the projection bounds of a regional map (Europe, Africa) from its states: for each candidate box
 * (west, east, north, south) counts the capitals inside the box whose exact projected tile is conquerable land.
 * Score = hits − 2 × misses over the capitals inside the box. Prints the best boxes.
 *
 *   npx tsx scripts/maps/fit-bounds.ts Europe
 */
import {readFileSync} from "fs";
import {decodeMap} from "@frontline/core/map/codec/MapCodec";
import {GameMap} from "@frontline/core/map/GameMap";

function loadMap(name: string): GameMap {
	const data = new Uint8Array(readFileSync(`build/cache/${name}.mapcache`));
	let offset = 0;
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

const mapName = process.argv[2] ?? "Europe";
const map = loadMap(mapName);
const w = map.width;
const h = map.height;
// Candidates: the capitals of the region from the world list (the blocks are in list order: Africa first, then Asia, Europe, ...).
const world = JSON.parse(readFileSync("resources/maps/nations/World.source.json", "utf8")).nations as {name: string; lat: number; lon: number}[];
// Candidates: the states of the map's own source file (Europe) or the African block of the world list (Africa).
const SOURCE_CANDIDATES: Record<string, string> = {
	Europe: "resources/maps/nations/Europe.source.json",
};
const AFRICA_BLOCK = ["Алжир", "ЮАР"];
const candidates: {name: string; lat: number; lon: number}[] = SOURCE_CANDIDATES[mapName]
	? JSON.parse(readFileSync(SOURCE_CANDIDATES[mapName]!, "utf8")).nations
	: mapName === "Africa"
		? world.slice(world.findIndex(n => n.name === AFRICA_BLOCK[0]), world.findIndex(n => n.name === AFRICA_BLOCK[1]) + 1)
		: (() => { throw new Error(`no candidate list for ${mapName}`); })();
// Search ranges for each map (degrees): west, east, north, south.
const RANGES: Record<string, {west: [number, number]; east: [number, number]; north: [number, number]; south: [number, number]}> = {
	Europe: {west: [-30, -10], east: [30, 65], north: [65, 76], south: [30, 40]},
	Africa: {west: [-30, -5], east: [30, 60], north: [25, 45], south: [-40, 0]},
};
const range = RANGES[mapName]!;

type Box = {west: number; east: number; north: number; south: number};
const results: {box: Box; score: number; hits: number; misses: number}[] = [];
for (let west = range.west[0]; west <= range.west[1]; west += 1)
	for (let east = range.east[0]; east <= range.east[1]; east += 1)
		for (let north = range.north[0]; north <= range.north[1]; north += 1)
			for (let south = range.south[0]; south <= range.south[1]; south += 1) {
				let hits = 0, misses = 0;
				for (const c of candidates) {
					if (c.lon < west || c.lon > east || c.lat < south || c.lat > north) continue;
					const x = Math.round(((c.lon - west) / (east - west)) * (w - 1));
					const y = Math.round(((north - c.lat) / (north - south)) * (h - 1));
					if (map.getTile(y * w + x).conquerable) hits++; else misses++;
				}
				results.push({box: {west, east, north, south}, score: hits - 2 * misses, hits, misses});
			}
results.sort((a, b) => b.score - a.score);
for (const r of results.slice(0, 5)) console.log(JSON.stringify(r));
