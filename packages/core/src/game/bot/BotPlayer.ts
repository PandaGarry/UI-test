import {hash32} from "../Random";
import {BalanceConfig} from "../BalanceConfig";
import {Player} from "../player/Player";
import {botName} from "./BotNames";
import {HSLColor} from "../../util/HSLColor";
import {PriorityList} from "../../util/PriorityList";
import {territoryManager} from "../TerritoryManager";
import {gameMap} from "../GameData";

/** Deterministic bot colour from the bot id (no shared random state is used). */
function botColor(id: number): HSLColor {
	const h = hash32(id);
	return HSLColor.fromRGB(h & 255, (h >>> 8) & 255, (h >>> 16) & 255);
}

export class BotPlayer extends Player {
	protected override startTroops(): number {
		return BalanceConfig.botStartTroops;
	}

	override isBot(): boolean {
		return true;
	}

	protected override botCapDivisor(): number {
		return BalanceConfig.capBotDivisor;
	}

	protected readonly triggers: BotTrigger[] = [];
	protected readonly constraints: BotConstraints[] = [];
	protected readonly strategy: BotStrategy[] = [];
	//TODO: remove
	waterTiles = 0;

	constructor(id: number) {
		super(id, botName(id), botColor(id));
		triggers.forEach(closure => closure(this.triggers, this));
		constraints.forEach(closure => closure(this.constraints, this));
		strategies.forEach(closure => closure(this.strategy, this));
	}

	tick(): void {
		if (!this.triggers.some(trigger => trigger.trigger())) return;
		if (!this.constraints.every(constraint => constraint.allowAttack())) return;
		this.strategy.some(strategy => strategy.execute(this));
	}

	override addTile(tile: number) {
		super.addTile(tile);
		gameMap.onNeighbors(tile, neighbor => {
			if (territoryManager.isWater(neighbor)) {
				this.waterTiles++;
			}
		});
	}

	override removeTile(tile: number) {
		super.removeTile(tile);
		gameMap.onNeighbors(tile, neighbor => {
			if (territoryManager.isWater(neighbor)) {
				this.waterTiles--;
			}
		});
	}
}

const triggers = new PriorityList<(triggers: BotTrigger[], player: BotPlayer) => void>();
const constraints = new PriorityList<(constraints: BotConstraints[], player: BotPlayer) => void>();
const strategies = new PriorityList<(strategies: BotStrategy[], player: BotPlayer) => void>();

/**
 * Register a bot trigger.
 * Mutate the trigger array to add or remove triggers.
 * @param closure Called when bot triggers are processed
 * @param priority The priority to use
 */
export function registerBotTrigger(closure: (triggers: BotTrigger[], player: BotPlayer) => void, priority: number = 0): void {
	triggers.add(closure, priority);
}

/**
 * Register a bot constraint.
 * Mutate the constraint array to add or remove triggers.
 * @param closure Called when bot constraints are processed
 * @param priority The priority to use
 */
export function registerBotConstraint(closure: (constraints: BotConstraints[], player: BotPlayer) => void, priority: number = 0): void {
	constraints.add(closure, priority);
}

/**
 * Register a bot strategy.
 * Mutate the strategy array to add or remove strategies.
 * @param closure Called when bot strategies are processed
 * @param priority The priority to use
 */
export function registerBotStrategy(closure: (strategies: BotStrategy[], player: BotPlayer) => void, priority: number = 0): void {
	strategies.add(closure, priority);
}

export interface BotTrigger {
	/**
	 * @returns Whether to trigger a bot action
	 */
	trigger(): boolean;
}

export interface BotConstraints {
	/**
	 * @returns Whether to allow the bot to attack
	 */
	allowAttack(): boolean;
}

export interface BotStrategy {
	/**
	 * @returns Whether the strategy was executed
	 */
	execute(player: BotPlayer): boolean;
}