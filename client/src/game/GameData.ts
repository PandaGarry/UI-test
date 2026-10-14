import type {GameMap} from "../map/GameMap";
import type {GameMode} from "./mode/GameMode";

/**
 * The map of the current game.
 */
export let gameMap: GameMap;
/**
 * The current game mode.
 */
export let gameMode: GameMode;
/**
 * Whether the game is currently running.
 */
export let isPlaying: boolean;
/**
 * Local games are directly played on the client without any server interaction.
 */
export let isLocalGame: boolean;
/**
 * Simulation speed multiplier for local games (1 = real time).
 * Online games are paced by the server and ignore this.
 */
export let gameSpeed: number = 1;

export function initGameData(map: GameMap, mode: GameMode, isLocal: boolean, speed: number = 1): void {
	gameMap = map;
	gameMode = mode;
	isLocalGame = isLocal;
	gameSpeed = speed;
	isPlaying = true;
}

export function resetGameData(): void {
	isPlaying = false;
}