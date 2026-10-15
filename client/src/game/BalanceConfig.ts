/**
 * Central balance tuning for the simulation.
 *
 * Every gameplay number that designers may want to tweak lives here instead
 * of being scattered as magic constants across the game logic, so balance
 * experiments (and bot-vs-bot self-play checks) only ever touch this file.
 */
export const BalanceConfig = {
	/** Simulation ticks per game second (10 = 100 ms per tick, the same cadence as the reference game). */
	ticksPerSecond: 10,
	/** Ticks grouped into one network data packet (0.5 second). Must divide ticksPerSecond. */
	ticksPerPacket: 5,
	/** Troops every player starts the game with. */
	startingTroops: 1500,
	/**
	 * Multiplier for attack expansion delays (higher = slower conquest).
	 * Calibrated against the reference game by land share (Europe, 30 bots, 10 seeds, see docs/PARITY.md section 1.5
 * and docs/calibration-v2-2026-10-15.txt): the leader reaches 1% of land at about 110 s, 2% at about 157 s,
 * 5% at about 300-390 s; about 96% of land is taken by 600 s. Earlier values were measured with a headless harness
 * bug (tick counter undefined, so income never ran) and are void.
 */
	expansionDelayFactor: 8,
	/** Maximum boat speed in tiles per tick (was 0.75 upstream). */
	boatMaxSpeed: 1.1,
	/** Boat acceleration per tick (was 0.005 upstream). */
	boatAcceleration: 0.01,
	/** Below this territory size, income uses the faster divisor (fast start). */
	earlyIncomeTerritoryLimit: 300,
	/** Income divisor while below {@link earlyIncomeTerritoryLimit}. */
	earlyIncomeTilesPerTroop: 5,
	/** Game speed multipliers offered in the singleplayer setup screen. */
	gameSpeedOptions: [0.75, 1, 1.5, 2],
	/** Default game speed multiplier. */
	defaultGameSpeed: 1,
	/** Troop income is paid out every N ticks (5 ticks = 0.5 second at 10 ticks per second). */
	incomeIntervalTicks: 5,
	/** Income per payout: 1 troop per this many territory tiles (rounded down). */
	incomeTilesPerTroop: 10,
	/** Troops are capped at this value times the territory size. */
	troopCapPerTile: 100,
	/** Share of all occupied territory needed to win an FFA game (0–1). */
	winTerritoryShare: 0.9,
	/** Bot slider range on the create-lobby screen (the engine caps players by map size). */
	botCountMin: 1,
	botCountMax: 400,
	/** Seconds between pressing Start on the create-lobby screen and the match starting; Start again cancels. */
	lobbyStartDelaySeconds: 5,
	/** Default bot count on the create-lobby screen. */
	defaultBotCount: 30
} as const;
