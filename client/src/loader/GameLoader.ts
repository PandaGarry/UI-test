import type {GameModeIds} from "@frontline/core/protocol/util/GameTypeIds";
import {mapFromId} from "./MapRegistry";
import {startGame} from "@frontline/core/game/Game";
import {EventHandlerRegistry} from "@frontline/core/util/events/EventHandlerRegistry";
import {gameModeFromId} from "@frontline/core/game/mode/GameModeRegistry";

/**
 * Start a new game with the given map.
 * @param map The map to start the game with
 * @param mode The game mode to use
 * @param seed The seed for the random number generator
 * @param players The players in the game
 * @param clientId The id of the local player
 * @param isLocal Whether the game is a local game
 */
export function tryStartGame(map: string, mode: GameModeIds, seed: number, players: { name: string }[], clientId: number, isLocal: boolean, maxPlayerCount?: number, speed?: number) {
	mapFromId(map)
		.then(map => startGame(map, gameModeFromId(mode), seed, players, clientId, isLocal, maxPlayerCount, speed))
		.catch(gameLoadFailRegistry.broadcast.bind(gameLoadFailRegistry));
}

export const gameLoadFailRegistry = new EventHandlerRegistry<[Error]>();