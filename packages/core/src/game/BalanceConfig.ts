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
	 * as players do (AttackRules: attackerIsHumanOrNation), with their own rules. The difficulty chosen in the lobby
	 * sets the values below; the numbers are the reference game's (EngineConfig.ts startManpower, Config.ts
	 * maxTroops and troopIncreaseRate, NationExecution.ts getAttackRate). One difficulty also applies to the bots (see botDifficulty).
	 * troopCapShare multiplies the troop cap (the reference uses it for nations only).
	 */
	nationDifficulty: {
		easy: {startTroops: 12500, troopCapShare: 0.5, growthMultiplier: 0.9, attackIntervalTicks: [65, 100], retainPercent: 0},
		medium: {startTroops: 18750, troopCapShare: 0.75, growthMultiplier: 0.95, attackIntervalTicks: [55, 70], retainPercent: 0},
		hard: {startTroops: 25000, troopCapShare: 1, growthMultiplier: 1, attackIntervalTicks: [45, 60], retainPercent: 75},
		impossible: {startTroops: 31250, troopCapShare: 1.25, growthMultiplier: 1.05, attackIntervalTicks: [30, 50], retainPercent: 90},
	} as const,
	/**
	 * Distance in tiles (Manhattan) that a spawn must keep from the start tiles of the other players, and the lowest
	 * spacing of the spawn grid (reference Config.minDistanceBetweenPlayers = 30, SpawnExecution.ts).
	 */
	minSpawnDistance: 30,
	/** Difficulty used when the lobby does not choose one: the reference single-player default (Easy, SinglePlayerModal DEFAULT_OPTIONS). */
	defaultNationDifficulty: "easy" as const,
	/**
	 * Relation change of the attacked player toward the attacker when an attack on a player starts
	 * (reference AttackExecution: -60 Easy, -70 Medium, -80 Hard, -100 Impossible). Relations run from -100 to 100.
	 */
	attackRelationPenalty: {easy: -60, medium: -70, hard: -80, impossible: -100},
	/** Relation points per tick that move a relation back toward 0 (reference PlayerImpl.decayRelations). */
	relationDecayPerTick: 0.05,
	/** Relation gained by both sides when an alliance is formed (reference AllianceRequestExecution). */
	allianceFormRelation: 100,
	/** Ticks a pending alliance request waits for an answer; after that it is rejected (reference allianceRequestDuration, 20 s). */
	allianceRequestDurationTicks: 200,
	/** Ticks between two requests from the same player to the same player (reference allianceRequestCooldown, 30 s). */
	allianceRequestCooldownTicks: 300,
	/** Ticks an alliance lasts before it expires unless both sides extend it (reference allianceDuration, 5 min). */
	allianceDurationTicks: 3000,
	/** Ticks before expiry from which the extension can be requested (reference allianceExtensionPromptOffset, 30 s). */
	allianceExtensionPromptTicks: 300,
	/** Relation the other side loses when an alliance is broken (reference BreakAllianceExecution). */
	allianceBreakRelation: -100,
	/** Relation the neighbours of the breaker lose toward the breaker (reference BreakAllianceExecution). */
	allianceBreakNeighbourRelation: -40,
	/**
	 * Bot behaviour by the lobby difficulty. The reference uses the same game difficulty for bots (TribeExecution uses
	 * AiAttackBehavior, which reads gameConfig().difficulty). Only the switches a simple bot can express are ported here:
	 * - maxParallelAttacks: outgoing attacks at once (reference getBotAttackMaxParallelism: Easy 1, Medium 1 or 2 at random,
	 *   Hard 3, Impossible 100). Medium uses 2 here; the random 1-or-2 is not ported.
	 * - humanAttackSkipPercent: chance to skip an attack on a human (reference: Easy 3 of 4, Medium 1 of 4, Hard and Impossible never).
	 * Not ported yet (docs/DIFFICULTY-2026-10-19.md): retaliation, reachability, boat routes, strategy order, reserve share.
	 */
	botDifficulty: {
		easy: {maxParallelAttacks: 1, oneAttackChancePercent: 0, humanAttackSkipPercent: 75, retaliation: "none", targetPolicy: "random"},
		medium: {maxParallelAttacks: 2, oneAttackChancePercent: 50, humanAttackSkipPercent: 25, retaliation: "afterCooldown", targetPolicy: "legacy"},
		hard: {maxParallelAttacks: 3, oneAttackChancePercent: 0, humanAttackSkipPercent: 0, retaliation: "first", targetPolicy: "priority"},
		impossible: {maxParallelAttacks: 100, oneAttackChancePercent: 0, humanAttackSkipPercent: 0, retaliation: "first", targetPolicy: "priority"},
	} as const,
	/**
	 * Parts of the bot table (reference AiAttackBehavior):
	 * - oneAttackChancePercent: chance that the limit is 1 instead of maxParallelAttacks (reference Medium: 1 or 2, 50/50).
	 * - retaliation: "none" (Easy); "afterCooldown" (Medium: answers an attacker after the cooldown check); "first" (Hard and
	 *   Impossible: answers before the trigger and the cooldown, as the reference does before the ratio checks).
	 * - targetPolicy: "random" (Easy: a random neighbour after the neutral land); "legacy" (Medium: the bot's own choice with
	 *   drop, small and density rules); "priority" (Hard and Impossible: very weak, then the juiciest, then the weakest).
	 */

	/** Shares of the troops kept back by the decision rule: triggers at 50-60 %, keeps 30-40 % (reserve), expands with 10-20 %. */
	nationTriggerPercent: [50, 60] as const,
	nationReservePercent: [30, 40] as const,
	nationExpandPercent: [10, 20] as const,
} as const;

/** Lobby difficulty: one choice for the states and the bots (keys of BalanceConfig.nationDifficulty and botDifficulty). */
export type GameDifficulty = keyof typeof BalanceConfig.botDifficulty;
