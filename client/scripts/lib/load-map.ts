import {readFileSync} from "fs";
import {decodeMap} from "@frontline/core/map/codec/MapCodec";
import {GameMap} from "@frontline/core/map/GameMap";

/**
 * Loads a built map from build/cache/<name>.mapcache (run `npm run gen-maps` first) and prepares its area and
 * distance maps, the same way the game does. Shared by the simulation and map scripts.
 */
export function loadMap(name: string): GameMap {
	let data: Uint8Array;
	try {
		data = new Uint8Array(readFileSync(`build/cache/${name}.mapcache`));
	} catch {
		throw new Error(`Map cache for ${name} not found. Run: npm run gen-maps`);
	}
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
