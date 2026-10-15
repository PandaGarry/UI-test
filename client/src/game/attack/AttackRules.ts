/**
 * Attack resolution rules (docs/PARITY.md section 2).
 *
 * Every number here comes from the reference balance measured in docs/PARITY.md section 2.
 * The code is our own implementation of those rules; no code from the reference game is used.
 */

import {BalanceConfig} from "../BalanceConfig";

/** Terrain classes used for combat. Our maps only have tile costs, so the class is derived from the cost (see terrainOf). */
export const enum Terrain {
	Plains = 0,
	Highland = 1,
	Mountain = 2,
}

/** Map a tile's expansion cost to a terrain class. Our maps have no terrain type yet (see docs/PARITY.md 2.2). */
export function terrainOf(expansionCost: number): Terrain {
	if (expansionCost >= 80) return Terrain.Mountain;
	if (expansionCost >= 70) return Terrain.Highland;
	return Terrain.Plains;
}

/** Base loss weight (mag) and time weight (tileCost) per terrain. */
const TERRAIN_BASE: readonly {mag: number; tileCost: number; priorityBonus: number}[] = [
	{mag: 80, tileCost: 16.5, priorityBonus: 1},
	{mag: 100, tileCost: 20, priorityBonus: 1.5},
	{mag: 120, tileCost: 25, priorityBonus: 2},
];

const LARGE_TERRITORY_MIDPOINT = 300_000;
const LARGE_TERRITORY_STEEPNESS = 2.5;
const BOT_DEFENDER_LOSS_MULT = 0.7;
const TERRA_NULLIUS_COST_SCALE = 2000;
const TERRA_NULLIUS_MIN_COST = 5;
const TERRA_NULLIUS_MAX_COST = 100;

export interface AttackLogicInput {
	terrain: Terrain;
	attackTroops: number;
	/** Attacker type: bots lose less on unclaimed land. */
	attackerIsBot: boolean;
	/** Human and nation attackers lose less troops to bots (defender loss multiplier). */
	attackerIsHumanOrNation: boolean;
	attackerTiles: number;
	/** null for unclaimed land. */
	defender: null | {isBot: boolean; tiles: number; troops: number};
	/** Number of frontier tiles of this attack; more frontier tiles means faster conquest. */
	borderSize: number;
}

export interface AttackLogicResult {
	attackerTroopLoss: number;
	defenderTroopLoss: number;
	/** Share of one tick consumed by this conquest. Tiles are taken until the shares sum to 1 per tick. */
	tickFraction: number;
}

function within(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function sigmoid(value: number, decayRate: number, midpoint: number): number {
	return 1 / (1 + Math.exp(-decayRate * (value - midpoint)));
}

/** Large territories are cheaper and faster to attack from and into. 1 for small empires, down to 1 - depth for huge ones. */
export function largeTerritoryBonus(tiles: number, depth: number): number {
	return 1 - depth * sigmoid(Math.log(Math.max(1, tiles)), LARGE_TERRITORY_STEEPNESS, Math.log(LARGE_TERRITORY_MIDPOINT));
}

/** Frontier priority weight for a tile by terrain (lower is taken earlier). */
export function terrainPriorityBonus(terrain: Terrain): number {
	return TERRAIN_BASE[terrain].priorityBonus;
}

/**
 * Measured on the reference (docs/COMBAT-STUDY-2026-10-15.md, probe on World with bots only).
 * Index: r = attack troops / defender troops. Values are per captured tile on plains.
 */
const RATIO_POINTS = [0.015, 0.045, 0.08, 0.125, 0.175, 0.25, 0.35, 0.45, 0.575, 0.72, 0.9, 1.12, 1.37, 1.75, 2.5];
const ATTACKER_COST_PER_TILE = [48, 72, 76, 76, 80, 85, 92, 91, 82, 65, 50, 45, 38, 35, 38];
const TILES_PER_TICK = [3.8, 6.1, 6.3, 6.4, 7.0, 9.4, 12.6, 16, 20, 24.5, 30, 32, 35, 40, 36];

/** Piecewise-linear lookup; ratios beyond the last point use the last value. */
function lookup(table: readonly number[], ratio: number): number {
	if (ratio <= RATIO_POINTS[0]) return table[0];
	for (let i = 1; i < RATIO_POINTS.length; i++) {
		if (ratio <= RATIO_POINTS[i]) {
			const t = (ratio - RATIO_POINTS[i - 1]) / (RATIO_POINTS[i] - RATIO_POINTS[i - 1]);
			return table[i - 1] + t * (table[i] - table[i - 1]);
		}
	}
	return table[table.length - 1];
}

export function attackLogic(input: AttackLogicInput): AttackLogicResult {
	const base = TERRAIN_BASE[input.terrain];
	const attackTroops = Math.max(1, input.attackTroops);

	if (input.defender === null) {
		// Unclaimed land: no defender losses; time depends on the attack size and border width.
		const tickBudget = input.borderSize * 2;
		return {
			attackerTroopLoss: base.mag / (input.attackerIsBot ? 10 : 5),
			defenderTroopLoss: 0,
			tickFraction: within((TERRA_NULLIUS_COST_SCALE * base.tileCost) / attackTroops, TERRA_NULLIUS_MIN_COST, TERRA_NULLIUS_MAX_COST) / Math.max(1, tickBudget),
		};
	}

	// Attack against a player: cost and speed follow the measured curves (per tile, plains = mag 80).
	const ratio = attackTroops / Math.max(1, input.defender.troops);
	let magScale = base.mag / TERRAIN_BASE[Terrain.Plains].mag;
	if (input.attackerIsHumanOrNation && input.defender.isBot) {
		magScale *= BOT_DEFENDER_LOSS_MULT;
	}

	// Defender loses its average troops per tile.
	const defenderTroopLoss = input.defender.troops / Math.max(1, input.defender.tiles);

	const attackerTroopLoss = lookup(ATTACKER_COST_PER_TILE, ratio) * magScale;
	// Share of one tick used by this conquest; tiles are taken until the shares sum to the tick budget.
	const tickFraction = base.tileCost / TERRAIN_BASE[Terrain.Plains].tileCost / lookup(TILES_PER_TICK, ratio);

	return {attackerTroopLoss, defenderTroopLoss, tickFraction};
}

/** Troop growth for one tick (docs/PARITY.md section 1.2), including the bot multiplier. */
export function growthPerTick(troops: number, cap: number, isBot: boolean): number {
	const free = Math.max(0, 1 - troops / cap);
	const raw = (BalanceConfig.growthBase + Math.pow(troops, BalanceConfig.growthExponent) / BalanceConfig.growthDivisor) * free;
	return isBot ? raw * BalanceConfig.botGrowthMultiplier : raw;
}
