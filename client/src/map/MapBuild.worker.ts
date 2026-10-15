/**
 * Builds a playable map off the main thread: decodes the map bytes and computes the area and distance maps.
 * Building takes seconds on large maps (Europe: about 2.5 s on a desktop), which froze the game when it ran
 * on the UI thread at the end of the lobby countdown.
 */
import {decodeMap} from "./codec/MapCodec";
import {GameMap} from "./GameMap";

export interface MapBuildRequest {
	id: string;
	data: Uint8Array;
}

export interface MapBuildResult {
	id: string;
	width: number;
	height: number;
	types: unknown[];
	tiles: Uint16Array;
	tileExpansionCosts: Uint8Array;
	tileExpansionTimes: Uint8Array;
	areaMap: Uint16Array;
	areaSizes: number[];
	tileInfluence: Uint32Array;
	distanceMap: Int16Array;
}

const scope = self as unknown as {
	onmessage: ((event: MessageEvent<MapBuildRequest>) => void) | null;
	postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (event: MessageEvent<MapBuildRequest>) => {
	const {id, data} = event.data;
	try {
		const decoded = decodeMap(data);
		const map = new GameMap(id, decoded.width, decoded.height, decoded.types);
		for (let i = 0; i < decoded.tiles.length; i++) map.setTileId(i, decoded.tiles[i]);
		map.calculateAreaMap();
		map.calculateDistanceMap();
		const result: MapBuildResult & {error?: undefined} = {
			id,
			width: map.width,
			height: map.height,
			types: decoded.types,
			tiles: map.tiles,
			tileExpansionCosts: map.tileExpansionCosts,
			tileExpansionTimes: map.tileExpansionTimes,
			areaMap: map.areaMap,
			areaSizes: map.areaSizes,
			tileInfluence: map.tileInfluence,
			distanceMap: map.distanceMap,
		};
		scope.postMessage(result, [map.tiles.buffer, map.tileExpansionCosts.buffer, map.tileExpansionTimes.buffer, map.areaMap.buffer, map.tileInfluence.buffer, map.distanceMap.buffer]);
	} catch (error) {
		scope.postMessage({id, error: String(error)});
	}
};
