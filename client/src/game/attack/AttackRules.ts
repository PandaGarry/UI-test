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
const LARGE_ATTACKER_LOSS_DEPTH = 0.7;
const LARGE_ATTACKER_SPEED_DEPTH = 0.73;
const LARGE_DEFENDER_DEPTH = 0.3;
const BOT_DEFENDER_LOSS_MULT = 0.7;
const TERRA_NULLIUS_COST_SCALE = 2000;
const TERRA_NULLIUS_MIN_COST = 5;
const TERRA_NULLIUS_MAX_COST = 100;
const ATTACKER_LOSS_BASE = 0.463;
const ATTACKER_LOSS_PER_DENSITY = 0.0039;
const CHEAPEST_TROOP_RATIO = 0.6;
const SPEED_COST_DIVISOR = 8.55;

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

	let mag = base.mag;
	if (input.attackerIsHumanOrNation && input.defender.isBot) {
		mag *= BOT_DEFENDER_LOSS_MULT;
	}

	const largeAttackerLoss = largeTerritoryBonus(input.attackerTiles, LARGE_ATTACKER_LOSS_DEPTH);
	const largeAttackerSpeed = largeTerritoryBonus(input.attackerTiles, LARGE_ATTACKER_SPEED_DEPTH);
	const largeDefender = largeTerritoryBonus(input.defender.tiles, LARGE_DEFENDER_DEPTH);

	// Defender loses its average troops per tile.
	const density = input.defender.troops / Math.max(1, input.defender.tiles);
	const defenderTroopLoss = density;

	const troopRatio = input.defender.troops / attackTroops;
	const attackerTroopLoss =
		mag *
		within(troopRatio, CHEAPEST_TROOP_RATIO, 2) *
		(ATTACKER_LOSS_BASE * largeAttackerLoss * largeDefender + ATTACKER_LOSS_PER_DENSITY * density);

	const speedCost = (within(troopRatio, 0.82, 7.5) * within(troopRatio / 20, 1, 50)) / SPEED_COST_DIVISOR;
	const tickFraction = (speedCost * base.tileCost * largeAttackerSpeed * largeDefender) / Math.max(1, input.borderSize);

	return {attackerTroopLoss, defenderTroopLoss, tickFraction};
}

/** Troops an attack takes from the attacker for a given attacker type: bots send 5%, others the requested share. */
export function botAttackPerMille(): number {
	return BalanceConfig.botAttackPerMille;
}

/** Troop growth for one tick (docs/PARITY.md section 1.2), including the bot multiplier. */
export function growthPerTick(troops: number, cap: number, isBot: boolean): number {
	const free = Math.max(0, 1 - troops / cap);
	const raw = (BalanceConfig.growthBase + Math.pow(troops, BalanceConfig.growthExponent) / BalanceConfig.growthDivisor) * free;
	return isBot ? raw * BalanceConfig.botGrowthMultiplier : raw;
}
