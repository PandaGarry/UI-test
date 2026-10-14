/**
 * Generates the built-in maps locally from resources/maps/<Name>.{json,png},
 * instead of downloading them from the (defunct) upstream map registry.
 *
 * Output: build/cache/<Name>.mapcache in the format expected by
 * scripts/map-loader.js (name + author strings, zero-terminated, then the
 * MapCodec-encoded tile data). Run automatically via the prebuild/predev
 * npm hooks — see package.json.
 */
import {mkdirSync, readFileSync, writeFileSync} from "fs";
import {encodeMap, type RawMapData, type TileType} from "../src/map/codec/MapCodec";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {decodePNG} = require("./png-decode.js");

const AUTHOR = {id: "local", service: "local", user_id: "0", username: "Local", avatar_url: ""};

function buildMap(name: string): Uint8Array {
	const def = JSON.parse(readFileSync(`resources/maps/${name}.json`, "utf8")) as {
		tiles: (TileType & {color: string})[];
	};
	const png = decodePNG(readFileSync(`resources/maps/${name}.png`));
	// The PNGs contain anti-aliased edge pixels, so match each pixel to the
	// nearest palette colour instead of requiring an exact match.
	const palette = def.tiles.map(tile => {
		const c = tile.color.replace("#", "");
		return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)] as const;
	});
	const nearestCache = new Map<string, number>();
	const nearest = (r: number, g: number, b: number): number => {
		const key = `${r},${g},${b}`;
		let best = nearestCache.get(key);
		if (best === undefined) {
			let bestDist = Infinity;
			best = 0;
			palette.forEach(([pr, pg, pb], i) => {
				const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
				if (d < bestDist) { bestDist = d; best = i; }
			});
			nearestCache.set(key, best);
		}
		return best;
	};
	const tiles = new Uint16Array(png.width * png.height);
	for (let i = 0; i < tiles.length; i++) {
		tiles[i] = nearest(png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2]);
	}
	const types: TileType[] = def.tiles.map(t => ({
		name: t.name,
		colorBase: t.colorBase,
		colorVariant: t.colorVariant,
		conquerable: t.conquerable,
		navigable: t.navigable,
		expansionTime: t.expansionTime ?? 50,
		expansionCost: t.expansionCost ?? 50
	}));
	const data: RawMapData = {width: png.width, height: png.height, tiles, types};
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
