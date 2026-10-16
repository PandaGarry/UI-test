import type {APIUserAccount} from "../util/ProtocolUtils";

// Wire-format types of the map registry API (moved from network/api so that the map layer can use them).

export type APIMapInformation = {
	id: string,
	name: string,
	description: string,
	author: APIUserAccount,
	versions: MapVersion[]
}

export type MapVersion = {
	id: string,
	version: number,
	time: number
}
