import type {GameMap} from "../map/GameMap";
import type {GameMode} from "./mode/GameMode";
import type {GameResult} from "./result/GameResult";
import {territoryManager} from "./TerritoryManager";
import {playerManager} from "./player/PlayerManager";
import {Player} from "./player/Player";
import {spawnManager} from "./player/SpawnManager";
import {random} from "./Random";
import {attackActionHandler} from "./attack/AttackActionHandler";
import {paletteColor, setPaletteSeed} from "./player/PlayerPalette";
import {initGameData, resetGameData} from "./GameData";
import {ClientPlayer} from "./player/ClientPlayer";
import {EventHandlerRegistry} from "../util/events/EventHandlerRegistry";
import {borderManager} from "./BorderManager";
import {gameTicker} from "./GameTicker";
import {BalanceConfig} from "./BalanceConfig";
import type {NationDifficulty, NationSpec} from "./nation/NationPlayer";

/**
 * Start a new game with the given map.
 * @param map The map to start the game with
 * @param mode The game mode to use
 * @param seed The seed for the random number generator
 * @param players The players in the game
 * @param clientId The id of the local player
 * @param isLocal Whether the game is a local game
 * @param maxPlayerCount Humans and bots together (the lobby's bot count plus the humans). States are added on top.
 * @param speed Game speed multiplier
 * @param nations States from the map manifest (NationSpec). Each starts on its tile; bots never start near them. Empty = no states.
 * @param nationDifficulty Difficulty of the states (lobby choice). Bots have no difficulty.
 */
export function startGame(map: GameMap, mode: GameMode, seed: number, players: { name: string }[], clientId: number, isLocal: boolean, maxPlayerCount: number = 500, speed: number = 1, nations: readonly NationSpec[] = [], nationDifficulty: NationDifficulty = BalanceConfig.defaultNationDifficulty) {
	// The generator is reset first: every random draw below (spawn points, state and bot parameters) follows from the seed.
	random.reset(seed);
	initGameData(map, mode, isLocal, speed);
	gameLoadRegistry.broadcast();
	territoryManager.reset();
	const reserved = nations.map(spec => spec.y * map.width + spec.x);
	const maxPlayers = spawnManager.init(maxPlayerCount + nations.length, reserved, BalanceConfig.nationSpawnClearanceTiles);
	borderManager.reset(maxPlayers);
	attackActionHandler.init(maxPlayers);
	setPaletteSeed(seed);
	playerManager.init(players.map((p, i) => new (i === clientId ? ClientPlayer : Player)(i, p.name, paletteColor(i, seed))), clientId, maxPlayers, nations, nationDifficulty);

	gameInitRegistry.broadcast();
	playerManager.placeNations();
	playerManager.randomizeSpawnPoints();
	// Local games: the spawn-selection window (SPAWN_PHASE_MS) starts only when the player can see the map,
	// i.e. after the loading window closes (see client/src/ui/element/LoadingOverlay.ts), not during loading.
	pendingSpawnPhase = isLocal ? {durationMs: SPAWN_PHASE_MS} : null;
}

let pendingSpawnPhase: {durationMs: number} | null = null;

/** Fired once when the map is actually visible to the player (loading window closed). Starts the local spawn-selection window. */
export const gameViewReadyRegistry = new EventHandlerRegistry<[]>();
gameViewReadyRegistry.register(() => {
	if (pendingSpawnPhase === null) return;
	const phase = pendingSpawnPhase;
	pendingSpawnPhase = null;
	spawnManager.beginSpawnPhase(phase.durationMs, msLeft => spawnPhaseRegistry.broadcast(msLeft));
});

/**
 * Local game: time to choose (or change) the start position after the map is visible. Real time, not ticks.
 * Purpose: the player picks the spawn; it is not the lobby cancel window (that is BalanceConfig.lobbyStartDelaySeconds).
 */
export const SPAWN_PHASE_MS = 20_000;

/** Remaining spawn-phase time in ms (0 = phase over). The client draws it (see ui/element/SpawnPhaseTimer.ts). */
export const spawnPhaseRegistry = new EventHandlerRegistry<[number]>();
/** Fired once when the spawn selection ends (timer over, or every player placed) and before the game starts. */
export const spawnSelectionEndedRegistry = new EventHandlerRegistry<[]>();

/**
 * Starts the playable part of the game, normally called by spawn selector.
 */
export function actuallyStartGame() {
	gameTicker.start();
	gameStartRegistry.broadcast();
	gameResumeRegistry.broadcast();
}

/**
 * Pauses the game, this should also block (most) interactions with the game.
 */
export function pauseGame() {
	gameTicker.pause();
	gamePauseRegistry.broadcast();
}

/**
 * Resumes the game after it was paused.
 */
export function resumeGame() {
	gameResumeRegistry.broadcast();
	gameTicker.resume();
}

/**
 * Quit the game, this should stop all game relevant tasks
 */
export function quitGame() {
	spawnManager.clearSpawnPhaseTimer();
	spawnPhaseRegistry.broadcast(0);
	gameQuitRegistry.broadcast();
	gameTicker.stop();
	gamePauseRegistry.broadcast();
	resetGameData();
}

/**
 * Call-order of these events:
 * 1. gameLoad - after maps are loaded, most methods won't work at this point
 * 2. gameInit - after initializing game data such as players
 * 3. gameStart - after players selected their spawns, before the first tick is processed (also fires a gameResume)
 * 4. gameResult - after the game finished (also fires a gamePause), this might be called again after the game is resumed
 * 5. gameQuit - before the client leaves the game
 *
 * gamePause and gameResume are called whenever the ticker is paused or resumed.
 * If {@link GameTicker.isPaused} is false this event was fired along gameInit or gameResult.
 */
export const gameLoadRegistry = new EventHandlerRegistry<[]>();
export const gameInitRegistry = new EventHandlerRegistry<[]>();
export const gameStartRegistry = new EventHandlerRegistry<[]>();
export const gamePauseRegistry = new EventHandlerRegistry<[]>();
export const gameResumeRegistry = new EventHandlerRegistry<[]>();
export const gameResultRegistry = new EventHandlerRegistry<[GameResult]>();
export const gameQuitRegistry = new EventHandlerRegistry<[]>();