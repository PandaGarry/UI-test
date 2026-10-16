import {BalanceConfig} from "../../BalanceConfig";
import {type BotPlayer, type BotStrategy, registerBotStrategy} from "../BotPlayer";
import {borderManager} from "../../BorderManager";
import {gameMap, gameMode} from "../../GameData";
import {territoryManager} from "../../TerritoryManager";
import {random} from "../../Random";
import {playerManager} from "../../player/PlayerManager";
import {actuallyHandleAttack} from "../../attack/AttackActionValidator";


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