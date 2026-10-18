import {BalanceConfig} from "../../BalanceConfig";
import {type BotPlayer, type BotStrategy, registerBotStrategy} from "../BotPlayer";
import {borderManager} from "../../BorderManager";
import {gameMap, gameMode} from "../../GameData";
import {territoryManager} from "../../TerritoryManager";
import {random} from "../../Random";
import {playerManager} from "../../player/PlayerManager";
import {actuallyHandleAttack} from "../../attack/AttackActionValidator";
import {NationPlayer} from "../../nation/NationPlayer";


/** A human player: not a bot and not a state (states are players of the manifest, see NationPlayer). */
function isHuman(target: number): boolean {
	const player = playerManager.getPlayer(target);
	return !playerManager.isBot(target) && !(player instanceof NationPlayer);
}

/**
 * Hard and Impossible (reference getAttackStrategies order veryWeak, juicy, weakest; structures are not in this game, so
 * the juiciest is the target with the largest troop gap below its cap).
 * @returns The target, or null if there is none
 */
export function priorityTarget(player: BotPlayer, targets: number[]): number | null {
	const candidates = targets.map(target => playerManager.getPlayer(target));
	const byTroops = [...candidates].sort((a, b) => a.getTroops() - b.getTroops() || a.id - b.id);
	const veryWeak = byTroops.find(other => other.getTroops() < other.troopCap() * 0.15);
	if (veryWeak) return veryWeak.id;

	let juicy: number | null = null;
	let largestGap = -Infinity;
	for (const other of candidates) {
		if (other.getTroops() > player.getTroops() * 0.75) continue;
		const gap = 1 - other.getTroops() / Math.max(1, other.troopCap());
		if (gap > largestGap) {
			largestGap = gap;
			juicy = other.id;
		}
	}
	if (juicy !== null) return juicy;

	let weakest: number | null = null;
	let lowestDensity = Infinity;
	for (const other of candidates) {
		const density = other.getTroops() / Math.max(1, other.getTerritorySize());
		if (density < lowestDensity) {
			lowestDensity = density;
			weakest = other.id;
		}
	}
	return weakest;
}

export class SimpleAttackStrategy implements BotStrategy {
	constructor(
		private readonly dropAttackChance: number,
		private readonly targetSmallChance: number,
		private readonly targetNonPlayerChance: number,
		private readonly densityChoiceChance: number,
	) {}

	execute(player: BotPlayer): boolean {
		const target = this.getTarget(player);
		if (target === null) return false;
		// Lower difficulties sometimes leave a human alone (reference AiAttackBehavior: Easy 3 of 4, Medium 1 of 4).
		const skipPercent = BalanceConfig.botDifficulty[player.difficulty].humanAttackSkipPercent;
		if (skipPercent > 0 && target !== territoryManager.OWNER_NONE && isHuman(target) && random.nextInt(100) < skipPercent) return false;
		// Reference: bots send 25-50% of their troops, measured median 38% (docs/COMBAT-STUDY-2026-10-15.md).
		const perMille = BalanceConfig.botAttackMinPerMille + random.nextInt(BalanceConfig.botAttackMaxPerMille - BalanceConfig.botAttackMinPerMille + 1);
		actuallyHandleAttack(player, target, perMille);
		return true;
	}

	/**
	 * @returns The target of this bot strategy, or null if no attack should be performed
	 */
	getTarget(player: BotPlayer): number | null {
		//TODO: Neighbor logic should probably be done using tile updates instead of every tick
		// A Set keeps insertion order (same result as the previous array scan) but makes each membership check O(1).
		const targetSet = new Set<number>();
		for (const border of borderManager.getBorderTiles(player.id)) {
			gameMap.onNeighbors(border, neighbor => {
				const owner = territoryManager.getOwner(neighbor);
				if (owner !== player.id) targetSet.add(owner);
			});
		}
		let targets: number[] = [...targetSet].filter(target => gameMode.canAttack(player.id, target));
		if (targets.length < 1) {
			return null;
		}

		//Always attack neutral territories if possible
		if (targets.includes(territoryManager.OWNER_NONE)) {
			return territoryManager.OWNER_NONE;
		}

		const policy = BalanceConfig.botDifficulty[player.difficulty].targetPolicy;
		if (policy === "random") return targets[random.nextInt(targets.length)];
		if (policy === "priority") return priorityTarget(player, targets);

		//Chance to not attack, might cause a boat to be spawned instead
		if (random.nextInt(100) < this.dropAttackChance) {
			return null;
		}

		//Prefer attacking players with 10% or less of the player's territories (also kinda to make the game map look less chaotic)
		if (random.nextInt(100) < this.targetSmallChance) {
			const smallTargets = targets.filter(target => playerManager.getPlayer(target).getTerritorySize() < player.getTerritorySize() * 0.1);
			if (smallTargets.length > 0) {
				targets = smallTargets;
			}
		}

		//Prefer attacking non-player territories
		if (random.nextInt(100) < this.targetNonPlayerChance) {
			const nonPlayerTargets = targets.filter(target => playerManager.isBot(target));
			if (nonPlayerTargets.length > 0) {
				targets = nonPlayerTargets;
			}
		}

		//Attack the player with the lowest density
		if (random.nextInt(100) < this.densityChoiceChance) {
			let lowestDensity = Infinity, lowestDensityTarget = null;
			for (const target of targets) {
				const player = playerManager.getPlayer(target);
				const density = player.getTroops() / player.getTerritorySize();
				if (density < lowestDensity) {
					lowestDensity = density;
					lowestDensityTarget = target;
				}
			}
			return lowestDensityTarget;
		}

		return targets[random.nextInt(targets.length)];
	}
}

registerBotStrategy(s => s.push(new SimpleAttackStrategy(5 + random.nextInt(10), random.nextInt(100), random.nextInt(100), random.nextInt(20))));