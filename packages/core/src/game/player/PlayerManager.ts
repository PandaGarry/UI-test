import type {Player} from "./Player";
import {BalanceConfig, type GameDifficulty} from "../BalanceConfig";
import {BotPlayer} from "../bot/BotPlayer";
import {spawnManager} from "./SpawnManager";
import {gameTicker} from "../GameTicker";
import {NationPlayer, type NationSpec} from "../nation/NationPlayer";
import {paletteColor} from "./PlayerPalette";

class PlayerManager {
	/** First id that belongs to a bot: humans, then states, then bots (ids are sequential). */
	private botStartId: number;
	private players: Player[];
	private bots: BotPlayer[];
	private nations: NationPlayer[];

	/**
	 * Initializes the player manager with the given players.
	 * @param humans human players, one for local games, multiple for online games.
	 * @param clientId Player ID of the client player (the player that is controlled this client).
	 * @param maxPlayers The maximum number of players: humans, states and bots together.
	 * @param nations States of the map manifest (see NationSpec). They are created after the humans and placed on their tiles.
	 * @param difficulty Lobby difficulty: the states (BalanceConfig.nationDifficulty) and the bots (BalanceConfig.botDifficulty).
	 */
	init(humans: Player[], clientId: number, maxPlayers: number, nations: readonly NationSpec[] = [], difficulty: GameDifficulty = BalanceConfig.defaultNationDifficulty): void {
		this.players = [];
		this.bots = [];
		this.nations = [];

		clientPlayer = humans[clientId];
		for (const player of humans) {
			this.registerPlayer(player, false);
		}

		// States take the ids after the humans. They are placed on their start tiles later (placeNations), after the game
		// init broadcast, so client managers that follow conquests are ready when the first tiles are taken.
		for (const spec of nations) {
			const nation = new NationPlayer(this.players.length, spec, paletteColor(this.players.length), difficulty);
			this.registerPlayer(nation, false);
			this.nations.push(nation);
		}
		this.botStartId = this.players.length;

		for (let i = humans.length + nations.length; i < maxPlayers; i++) {
			this.registerPlayer(new BotPlayer(this.players.length, difficulty), true);
		}
	}

	/**
	 * Places the states on their start tiles (the tiles are conquered for them). Called by startGame after gameInitRegistry
	 * and before the bots get their spawn points, so the order of the simulation is unchanged.
	 * @throws Error if a start tile is not land (the manifest is wrong)
	 */
	placeNations(): void {
		for (const nation of this.nations) {
			if (!spawnManager.placeAt(nation, nation.startTile)) {
				throw new Error(`State ${nation.name}: start tile is not land`);
			}
		}
	}

	/** Ids of the states, in manifest order. */
	getNations(): readonly NationPlayer[] {
		return this.nations;
	}

	randomizeSpawnPoints(): void {
		this.bots.forEach(bot => spawnManager.randomSpawnPoint(bot));
	}

	/**
	 * Register a player.
	 * @param player The player to register.
	 * @param isBot Whether the player is a bot.
	 */
	registerPlayer(player: Player, isBot: boolean): void {
		this.players.push(player);
		if (isBot) {
			this.bots.push(player as BotPlayer);
		}
	}

	/**
	 * Get the player with the given ID.
	 * @param id The ID of the player.
	 */
	getPlayer(id: number): Player {
		return this.players[id];
	}

	/**
	 * Get all players.
	 */
	getPlayers(): Player[] {
		return this.players;
	}

	/**
	 * Check if the player with the given ID is a bot.
	 * @param player The ID of the player.
	 * @returns Whether the player is a bot.
	 */
	isBot(player: number): boolean {
		return player >= this.botStartId;
	}

	//TODO: bot ticking should be done in a separate bot manager
	tick(): void {
		this.nations.forEach(nation => nation.tick());
		this.bots.forEach(bot => bot.tick());
		if (gameTicker.getTickCount() % BalanceConfig.incomeIntervalTicks === 0) {
			this.players.forEach(player => player.income());
		}
	}

	/**
	 * Validate a player id.
	 * @param player The player to validate
	 * @returns Whether the player is valid
	 */
	validatePlayer(player: number) {
		return this.players[player] && this.players[player].isAlive();
	}
}

export const playerManager = new PlayerManager();
export let clientPlayer: Player;

gameTicker.registry.register(playerManager.tick.bind(playerManager));