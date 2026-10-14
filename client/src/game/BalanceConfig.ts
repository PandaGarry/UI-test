/**
 * Central balance tuning for the simulation.
 *
 * Every gameplay number that designers may want to tweak lives here instead
 * of being scattered as magic constants across the game logic, so balance
 * experiments (and bot-vs-bot self-play checks) only ever touch this file.
 */
export const BalanceConfig = {
	/** Troops every player starts the game with. */
	startingTroops: 1000,
	/** Troop income is paid out every N ticks (20 ticks = 1 second). */
	incomeIntervalTicks: 10,
	/** Income per payout: 1 troop per this many territory tiles (rounded down). */
	incomeTilesPerTroop: 10,
	/** Troops are capped at this value times the territory size. */
	troopCapPerTile: 100,
	/** Share of all occupied territory needed to win an FFA game (0–1). */
	winTerritoryShare: 0.9,
	/** Bot counts offered in the singleplayer setup screen. */
	botCountOptions: [10, 30, 60, 120],
	/** Default bot count in the singleplayer setup screen. */
	defaultBotCount: 30
} as const;
