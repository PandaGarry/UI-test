import {setMapApi} from "../../loader/MapRegistry";
import {downloadMap, getMapVersion} from "./MapRegistryRoutes";

// Registers the HTTP implementation of the map API (see MapApi in map/MapRegistry.ts).
setMapApi({
	downloadMap: id => downloadMap({id}).await(200),
	getMapVersion: id => getMapVersion({id}).await(200),
});
