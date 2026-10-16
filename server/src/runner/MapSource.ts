import {readFileSync} from "fs";
import {join} from "path";
import {type MapApi, setMapApi} from "../../../client/src/map/MapRegistry";
import {downloadMap, getMapVersion} from "../../../client/src/network/api/MapRegistryRoutes";

/**
 * Drops the header of a build/cache file: six zero-terminated strings (name, author id, service, user id,
 * username, avatar URL), then the encoded map. Same layout as scripts/map-loader.js reads.
 */
export function stripCacheHeader(data: Uint8Array): Uint8Array {
	let offset = 0;
	for (let field = 0; field < 6; field++) {
		const end = data.indexOf(0, offset);
		if (end < 0) throw new Error("Corrupt map cache: header is incomplete");
		offset = end + 1;
	}
	return data.slice(offset);
}

/**
 * Map source for the game runner.
 * Production: the same HTTP map API the client uses (see client/src/network/api/MapApiBinding.ts).
 * Offline and tests: LOCAL_MAP_CACHE_DIR points at client/build/cache/<id>.mapcache (written by `npm run gen-maps`).
 */
export function configureRunnerMapSource(): void {
	const cacheDir = process.env.LOCAL_MAP_CACHE_DIR;
	if (!cacheDir) {
		setMapApi({
			downloadMap: id => downloadMap({id}).await(200),
			getMapVersion: id => getMapVersion({id}).await(200),
		});
		return;
	}
	const offline: MapApi = {
		downloadMap: async id => stripCacheHeader(new Uint8Array(readFileSync(join(cacheDir, `${id}.mapcache`)))),
		getMapVersion: async () => {
			throw new Error("getMapVersion is not available in offline map mode");
		},
	};
	setMapApi(offline);
}
