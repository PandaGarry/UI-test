import type {GameModeIds} from "@frontline/core/protocol/util/GameTypeIds";
import {mapFromId} from "./MapRegistry";
import {startGame} from "@frontline/core/game/Game";
import {EventHandlerRegistry} from "@frontline/core/util/events/EventHandlerRegistry";
import {gameModeFromId} from "@frontline/core/game/mode/GameModeRegistry";
import {NATION_MANIFESTS} from "../app/NationManifests.gen";
import {type NationDifficulty} from "@frontline/core/game/nation/NationPlayer";
import {BalanceConfig} from "@frontline/core/game/BalanceConfig";

/** Lobby choice for the states: on or off, and their difficulty (reference options). */
export type StateOptions = {enabled: boolean; difficulty: NationDifficulty};

/**
 * Start a new game with the given map.
 * @param map The map to start the game with
 * @param mode The game mode to use
 * @param seed The seed for the random number generator
 * @param players The players in the game
 * @param clientId The id of the local player
 * @param isLocal Whether the game is a local game
 * States of the map come from its manifest (NATION_MANIFESTS, built by scripts/maps/build-nations.ts) when enabled.
 */
export function tryStartGame(map: string, mode: GameModeIds, seed: number, players: { name: string }[], clientId: number, isLocal: boolean, maxPlayerCount?: number, speed?: number, states: StateOptions = {enabled: true, difficulty: BalanceConfig.defaultNationDifficulty}) {
	const nations = states.enabled ? NATION_MANIFESTS[map] ?? [] : [];
	mapFromId(map)
		.then(map => startGame(map, gameModeFromId(mode), seed, players, clientId, isLocal, maxPlayerCount, speed, nations, states.difficulty))
		.catch(gameLoadFailRegistry.broadcast.bind(gameLoadFailRegistry));
}

export const gameLoadFailRegistry = new EventHandlerRegistry<[Error]>();