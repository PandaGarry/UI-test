import {Player} from "../player/Player";
import {BalanceConfig} from "../BalanceConfig";
import {gameMap, gameMode} from "../GameData";
import {borderManager} from "../BorderManager";
import {territoryManager} from "../TerritoryManager";
import {random} from "../Random";
import {gameTicker} from "../GameTicker";
import {playerManager} from "../player/PlayerManager";
import {actuallyHandleAttack} from "../attack/AttackActionValidator";
import type {HSLColor} from "../../util/HSLColor";

/** A state from the map manifest: its name and its start tile (x, y on the map grid). */
export type NationSpec = {readonly name: string; readonly x: number; readonly y: number};

/**
 * A state (in the reference game: a nation, PlayerType.Nation). It starts on a fixed tile of the map manifest,
 * is not a bot (AttackRules treats it as a player attacker, growth and spawn immunity are its own) and follows
 * a rule set with explicit parameters from BalanceConfig. There is no learning: the same seed and the same map
 * give the same game.
 *
 * Decision rule, run every nation interval (the phase is random, so states do not act in the same tick):
 *   1. Skip the interval if the troops are below the trigger share of the troop cap.
 *   2. Neutral land next to the state is taken first, with the expansion share kept back.
 *   3. Otherwise the neighbour with the lowest troop density is attacked, with the reserve share kept back.
 * The troops sent are the part above the kept share, converted to the per-mille power of actuallyHandleAttack.
 */
export class NationPlayer extends Player {
	/** Start tile index on the map. */
	readonly startTile: number;
	private readonly attackInterval: number;
	private readonly attackPhase: number;
	private readonly triggerShare: number;
	private readonly reserveShare: number;
	private readonly expandShare: number;

	constructor(id: number, spec: NationSpec, color: HSLColor) {
		super(id, spec.name, color);
		this.startTile = spec.y * gameMap.width + spec.x;
		const interval = BalanceConfig.nationAttackIntervalTicks;
		this.attackInterval = interval[0] + random.nextInt(interval[1] - interval[0] + 1);
		this.attackPhase = random.nextInt(this.attackInterval);
		this.triggerShare = drawPercent(BalanceConfig.nationTriggerPercent);
		this.reserveShare = drawPercent(BalanceConfig.nationReservePercent);
		this.expandShare = drawPercent(BalanceConfig.nationExpandPercent);
	}

	/** The rule parameters drawn at the start (for tests and the calibration report). */
	profile(): {attackInterval: number; attackPhase: number; triggerShare: number; reserveShare: number; expandShare: number} {
		return {
			attackInterval: this.attackInterval,
			attackPhase: this.attackPhase,
			triggerShare: this.triggerShare,
			reserveShare: this.reserveShare,
			expandShare: this.expandShare,
		};
	}

	protected override startTroops(): number {
		return BalanceConfig.nationStartTroops;
	}

	override hasSpawnImmunity(): boolean {
		return false;
	}

	protected override growthMultiplier(): number {
		return BalanceConfig.nationGrowthMultiplier;
	}

	/** Decision step, called every tick by PlayerManager. */
	tick(): void {
		if (!this.isAlive()) return;
		if (gameTicker.getTickCount() % this.attackInterval !== this.attackPhase) return;
		const cap = this.troopCap();
		if (this.getTroops() < cap * this.triggerShare) return;

		const owners = this.neighbourOwners();
		const neutral = owners.has(territoryManager.OWNER_NONE) && gameMode.canAttack(this.id, territoryManager.OWNER_NONE);
		const target = neutral ? territoryManager.OWNER_NONE : this.weakestNeighbour(owners);
		if (target === null) return;
		const keep = neutral ? this.expandShare : this.reserveShare;
		const send = this.getTroops() - cap * keep;
		if (send <= 0 || this.getTroops() <= 0) return;
		const perMille = Math.min(1000, Math.floor((send * 1000) / this.getTroops()));
		if (perMille <= 0) return;
		actuallyHandleAttack(this, target, perMille);
	}

	private neighbourOwners(): Set<number> {
		const owners = new Set<number>();
		for (const border of borderManager.getBorderTiles(this.id)) {
			gameMap.onNeighbors(border, neighbor => {
				const owner = territoryManager.getOwner(neighbor);
				if (owner !== this.id) owners.add(owner);
			});
		}
		return owners;
	}

	/** The attackable neighbour with the lowest troop density; ties go to the lower id (deterministic). */
	private weakestNeighbour(owners: Set<number>): number | null {
		let best: number | null = null;
		let bestDensity = Infinity;
		for (const owner of [...owners].sort((a, b) => a - b)) {
			if (owner === territoryManager.OWNER_NONE || !gameMode.canAttack(this.id, owner)) continue;
			const other = playerManager.getPlayer(owner);
			const density = other.getTroops() / Math.max(1, other.getTerritorySize());
			if (density < bestDensity) {
				bestDensity = density;
				best = owner;
			}
		}
		return best;
	}
}

/** A percent drawn uniformly from [min, max] inclusive, returned as a share (0.5 = 50 %). */
function drawPercent(range: readonly [number, number]): number {
	return (range[0] + random.nextInt(range[1] - range[0] + 1)) / 100;
}
