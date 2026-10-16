import type {MapBuildResult} from "./MapBuild.worker";
import type {APIMapInformation, MapVersion} from "../protocol/api/MapRegistryTypes";
import {apiToUserAccount, type UserAccount} from "../protocol/util/ProtocolUtils";
import {GameMap, type TileType} from "./GameMap";
import {IllegalStateException} from "../util/Exceptions";

/**
 * Server access for maps. The map layer does not depend on networking: the network layer registers
 * the implementation at startup (same pattern as the command channel, see docs/ARCHITECTURE-PLAN-2026-10-16.md).
 */
export interface MapApi {
	downloadMap(id: string): Promise<Uint8Array>;
	getMapVersion(id: string): Promise<MapVersion & { entry: Omit<APIMapInformation, "versions"> }>;
}

let mapApi: MapApi | null = null;

export function setMapApi(api: MapApi): void {
	mapApi = api;
}

function requireMapApi(): MapApi {
	if (mapApi === null) throw new IllegalStateException("Map API is not configured");
	return mapApi;
}

const mapRegistry: Map<string, EncodedMapData> = new Map();
const mapCache: Map<string, Uint8Array> = new Map();

type EncodedMapData = {
	name: string;
	author: UserAccount
}

type MapInformation = Omit<APIMapInformation, "author"> & { author: UserAccount };

/**
 * Retrieves a map from the registry by its ID.
 * @param id string ID of the map version
 * @returns the map
 */
// Built maps are cached: terrain is only written while building, so one instance can serve every match.
// Building (decode + distance map) takes seconds on large maps, so it is started early (see preloadMap).
const builtMaps = new Map<string, Promise<GameMap>>();

export function preloadMap(id: string): Promise<GameMap> {
	let built = builtMaps.get(id);
	if (!built) {
		built = buildMapFromId(id);
		builtMaps.set(id, built);
		built.catch(() => builtMaps.delete(id));
	}
	return built;
}

export function mapFromId(id: string): Promise<GameMap> {
	return preloadMap(id);
}

async function buildMapFromId(id: string): Promise<GameMap> {
	if (!mapCache.has(id)) {
		mapCache.set(id, await requireMapApi().downloadMap(id));
	}
	const data = mapCache.get(id);
	if (!data) throw new IllegalStateException("Invalid map cache");
	const built = await buildInWorker(id, data);
	const map = new GameMap(id, built.width, built.height, built.types as TileType[]);
	map.tiles.set(built.tiles);
	map.tileExpansionCosts.set(built.tileExpansionCosts);
	map.tileExpansionTimes.set(built.tileExpansionTimes);
	map.areaMap.set(built.areaMap);
	map.areaSizes.length = 0;
	map.areaSizes.push(...built.areaSizes);
	map.tileInfluence.set(built.tileInfluence);
	map.distanceMap.set(built.distanceMap);
	return map;
}

/** Runs the map build in a worker so the UI thread stays responsive. */
function buildInWorker(id: string, data: Uint8Array): Promise<MapBuildResult> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./MapBuild.worker.ts", import.meta.url), {type: "module"});
		worker.onmessage = (event: MessageEvent<MapBuildResult & {error?: string}>) => {
			worker.terminate();
			if (event.data.error) reject(new IllegalStateException(event.data.error));
			else resolve(event.data);
		};
		worker.onerror = (event) => {
			worker.terminate();
			reject(new IllegalStateException(event.message));
		};
		worker.postMessage({id, data});
	});
}

/**
 * Retrieves the map information from the registry by its ID.
 * @param id string ID of the map version
 * @returns the map information
 */
export async function mapInfoFromId(id: string): Promise<MapVersion & { entry: Omit<MapInformation, "versions"> }> {
	const value = await requireMapApi().getMapVersion(id);
	return {...value, entry: {...value.entry, author: apiToUserAccount(value.entry.author)}};
}

/**
 * @returns an object containing the names and ids of all default maps (bundled with the game)
 */
export function getDefaultMapIds(): [string, EncodedMapData][] {
	return Array.from(mapRegistry.entries());
}

// The following lines are filled in by the build process
// BUILD_MAPS_REGISTER
// End of map register block