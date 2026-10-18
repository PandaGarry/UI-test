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
	/** Troops at spawn (reference: 10 000 for bots, 25 000 for humans, in the same internal units). */
	botStartTroops: 10000,
	humanStartTroops: 25000,
	/**
	 * Multiplier for attack expansion delays (higher = slower conquest).
	 * Calibrated against the reference game by land share (Europe, 30 bots, 10 seeds; see docs/PARITY.md section 1.3
 * and docs/calibration-v3-2026-10-15.txt): the leader reaches 1% of land at about 111 s (reference 118-123 s),
 * 2% at about 157 s (reference 178-189 s), 5% at about 300-510 s (reference 311-380 s), and about 95% of land is
 * taken by 600 s. The leader ends somewhat stronger than the reference (7.8-13.5% against 5.4-9.9%).
 * Values from before the tick-counter fix (2026-10-15) are void.
 */
	/** Maximum boat speed in tiles per tick (was 0.75 upstream). */
	boatMaxSpeed: 1.1,
	/** Boat acceleration per tick (was 0.005 upstream). */
	boatAcceleration: 0.01,
	/** Game speed multipliers offered in the singleplayer setup screen. */
	gameSpeedOptions: [0.75, 1, 1.5, 2],
	/** Default game speed multiplier. */
	defaultGameSpeed: 1,
	/** Troop growth is applied every N ticks (1 = every tick, as in the reference; the reference army changes smoothly per tick). */
	incomeIntervalTicks: 1,
	/**
	 * Troop growth per tick (docs/PARITY.md section 1.2): (growthBase + troops^growthExponent / growthDivisor)
	 * multiplied by the free share of the cap (1 - troops / cap). Fast for small armies, zero at the cap.
	 */
	growthBase: 10,
	growthExponent: 0.73,
	growthDivisor: 4,
	/** Troop cap = capMultiplier * (tiles^capTilesExponent * capScale + capOffset). Bots use capBotDivisor. */
	capMultiplier: 2,
	capTilesExponent: 0.6,
	capScale: 1000,
	capOffset: 50000,
	capBotDivisor: 3,
	/** Bots grow at this multiple of the player rate (docs/PARITY.md 1.2). */
	botGrowthMultiplier: 0.5,
	/** Share of troops a bot sends per attack, uniform in [min, max] per mille (250 = 25%). Humans choose with the HUD slider. */
	botAttackMinPerMille: 250,
	botAttackMaxPerMille: 500,
	/** Share of all occupied territory needed to win an FFA game (0–1). */
	winTerritoryShare: 0.9,
	/** Bot slider range on the create-lobby screen (the engine caps players by map size). */
	botCountMin: 1,
	botCountMax: 400,
	/**
	 * CANCEL WINDOW (not the spawn timer): after "Start game" in the create-lobby screen the match waits this many
	 * seconds, so the player can press Start again to cancel if they changed their mind. Then the map opens.
	 */
	lobbyStartDelaySeconds: 5,
	/** Default bot count on the create-lobby screen (reference: 400, docs/NATIONS-DISTRIBUTION-2026-10-18.md). */
	defaultBotCount: 400,
	/**
	 * States (nations) from the map manifest, see nation/NationPlayer.ts. They are not bots: they grow and attack
	 * as players do (AttackRules: attackerIsHumanOrNation), with their own growth multiplier and rules.
	 * Ranges are the reference difficulty Medium (NationExecution.ts: attackRate 55-70, triggerRatio 50-60,
	 * reserveRatio 30-40, expandRatio 10-20; EngineConfig.ts: growth multiplier 0.95). Percent values are of the troop cap.
	 */
	/** Troops at spawn: reference startManpower for Medium (EngineConfig.ts): bots 10 000, states 18 750, humans 25 000. */
	nationStartTroops: 18750,
	nationGrowthMultiplier: 0.95,
	nationAttackIntervalTicks: [55, 70] as const,
	nationTriggerPercent: [50, 60] as const,
	nationReservePercent: [30, 40] as const,
	nationExpandPercent: [10, 20] as const,
	/** Bot and free spawn points closer than this (in tiles) to a state's start tile are not used. */
	nationSpawnClearanceTiles: 12
} as const;
