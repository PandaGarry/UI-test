/**
 * Generates the built-in maps locally from resources/maps/<Name>.png (foundation source, see
 * scripts/maps/lib/png-io.ts) and resources/maps/<Name>.json (tile type table).
 *
 * The PNG is an 8-bit grayscale image: one foundation byte per tile (docs/MAP-ARCHITECTURE-2026-10-16.md, 3.2).
 * Tile types come from the foundation: water, plains, hills, mountains (the same types as before).
 *
 * Output: build/cache/<Name>.mapcache in the format expected by scripts/map-loader.js (name + author strings,
 * zero-terminated, then the MapCodec-encoded tile data). Run automatically via the prebuild/predev npm hooks.
 */
import {mkdirSync, readFileSync, writeFileSync} from "fs";
import {encodeMap, type RawMapData, type TileType} from "../../packages/core/src/map/codec/MapCodec";
import {decodeFoundationByte} from "../../packages/core/src/map/foundation/Foundation";
import {decodeGrayPNG} from "./maps/lib/png-io";

const AUTHOR = {id: "local", service: "local", user_id: "0", username: "Local", avatar_url: ""};

function buildMap(name: string): Uint8Array {
	const def = JSON.parse(readFileSync(`resources/maps/${name}.json`, "utf8")) as {
		tiles: (TileType & {color: string})[];
	};
	const index = (typeName: string): number => {
		const i = def.tiles.findIndex(t => t.name === typeName);
		if (i < 0) throw new Error(`${name}: tile type "${typeName}" missing in ${name}.json`);
		return i;
	};
	const water = index("Water");
	const byClass: Record<string, number> = {plains: index("Plains"), hills: index("Hills"), mountains: index("Mountains")};

	const src = decodeGrayPNG(readFileSync(`resources/maps/${name}.png`));
	const tiles = new Uint16Array(src.width * src.height);
	for (let i = 0; i < tiles.length; i++) {
		const d = decodeFoundationByte(src.pixels[i]);
		if (d.impassable) throw new Error(`${name}: impassable tiles are not supported by the game yet`);
		tiles[i] = d.land ? byClass[d.terrain] : water;
	}
	const types: TileType[] = def.tiles.map(t => ({
		name: t.name,
		colorBase: t.colorBase,
		colorVariant: t.colorVariant,
		conquerable: t.conquerable,
		navigable: t.navigable,
		expansionTime: t.expansionTime ?? 50,
		expansionCost: t.expansionCost ?? 50,
	}));
	const data: RawMapData = {width: src.width, height: src.height, tiles, types};
	return encodeMap(data);
}

function writeCache(name: string, data: Uint8Array): void {
	const strings = [name, AUTHOR.id, AUTHOR.service, AUTHOR.user_id, AUTHOR.username, AUTHOR.avatar_url];
	const headerLen = strings.reduce((sum, s) => sum + s.length + 1, 0);
	const cache = new Uint8Array(headerLen + data.length);
	let offset = 0;
	for (const s of strings) {
		for (const ch of s) cache[offset++] = ch.charCodeAt(0);
		cache[offset++] = 0;
	}
	cache.set(data, offset);
	writeFileSync(`build/cache/${name}.mapcache`, cache);
}

mkdirSync("build/cache", {recursive: true});
const names = readFileSync("resources/defaultMaps.txt", "utf8").split("\n").map(m => m.trim()).filter(Boolean);
for (const name of names) {
	const data = buildMap(name);
	writeCache(name, data);
	console.log(`Generated local map ${name} [${Math.round(data.length / 1024 * 10) / 10} KB]`);
}
