import * as DetMath from "../../util/DetMath";
import type {HSLColor} from "../../util/HSLColor";
import {BalanceConfig} from "../BalanceConfig";
import {growthPerTick} from "../attack/AttackRules";
import {gameMode} from "../GameData";
import {Relation, relationFromValue} from "../relation/Relation";

export class Player {
	readonly id: number;
	readonly name: string;
	readonly baseColor: HSLColor;
	private troops: number = this.startTroops();
	private territorySize: number = 0;
	private alive: boolean = true;

	constructor(id: number, name: string, baseColor: HSLColor) {
		this.id = id;
		this.name = name;
		this.baseColor = gameMode.processPlayerColor(id, baseColor);
	}

	/**
	 * Add a tile to the player's territory.
	 * WARNING: Make sure to call this method AFTER updating the territory manager.
	 * @param _tile The tile to add
	 * @internal
	 */
	addTile(_tile: number): void {
		this.territorySize++;
	}

	/**
	 * Remove a tile from the player's territory.
	 * WARNING: Make sure to call this method AFTER updating the territory manager.
	 * @param _tile The tile to remove
	 * @internal
	 */
	removeTile(_tile: number): void {
		this.territorySize--;

		if (this.territorySize === 0 && !gameMode.keepAlive(this)) {
			this.alive = false;
		}
	}

	/**
	 * Troop cap for the current territory size (docs/PARITY.md section 1.2).
	 */
	troopCap(): number {
		const c = BalanceConfig;
		const cap = c.capMultiplier * (DetMath.pow(this.territorySize, c.capTilesExponent) * c.capScale + c.capOffset);
		return this.botCapDivisor() > 1 ? cap / this.botCapDivisor() : cap;
	}

	/** Divisor applied to the troop cap; bots override it (see BalanceConfig.capBotDivisor). */
	protected botCapDivisor(): number {
		return 1;
	}

	/** Troops at spawn (docs/PARITY.md 1.2): human players start with more than bots. */
	protected startTroops(): number {
		return BalanceConfig.humanStartTroops;
	}

	/** Whether this player is a bot (bots grow and attack at a lower rate, see AttackRules). */
	isBot(): boolean {
		return false;
	}

	/** Sets the troops at the start of the game (subclasses with their own start value call it once, in the constructor). */
	protected initTroops(value: number): void {
		this.troops = value;
	}

	/** Whether this player is immune to attacks during the spawn phase (only human players, see SpawnImmunity.ts). */
	hasSpawnImmunity(): boolean {
		return !this.isBot();
	}

	/** Extra growth multiplier on top of the bot/player rate (states use their difficulty, BalanceConfig.nationDifficulty). */
	protected growthMultiplier(): number {
		return 1;
	}

	/**
	 * Pay out troop growth for one income interval (BalanceConfig.incomeIntervalTicks ticks).
	 */
	income() {
		const cap = this.troopCap();
		for (let tick = 0; tick < BalanceConfig.incomeIntervalTicks; tick++) {
			if (this.troops >= cap) break;
			this.troops = Math.min(cap, this.troops + growthPerTick(this.troops, cap, this.isBot()) * this.growthMultiplier());
		}
	}

	/**
	 * @returns The amount of troops the player has.
	 */
	getTroops(): number {
		return this.troops;
	}

	/**
	 * Add troops to the player.
	 * Troops will be capped at 100 times the territory size.
	 * @param amount The amount of troops to add.
	 */
	addTroops(amount: number) {
		this.troops = Math.min(this.troopCap(), this.troops + amount);
	}

	/**
	 * Remove troops from the player.
	 * @param amount The amount of troops to remove.
	 */
	removeTroops(amount: number) {
		this.troops = Math.max(0, this.troops - amount);
	}

	/**
	 * @returns The size of the player's territory (in tiles).
	 */
	getTerritorySize(): number {
		return this.territorySize;
	}

	/**
	 * @returns True if the player is alive, false otherwise.
	 */
	isAlive(): boolean {
		return this.alive;
	}

	/** Relation values toward other players, -100..100 (missing = 0). Insertion order keeps iteration deterministic. */
	private readonly relations = new Map<number, number>();
	/** Ids of the players this player is allied with (alliances are symmetric; both sides hold the id). */
	private readonly allies = new Set<number>();

	/** @returns The relation value toward another player, -100..100 (0 when no relation was ever set). */
	relationValue(other: number): number {
		return this.relations.get(other) ?? 0;
	}

	/** @returns The relation class toward another player (reference PlayerImpl.relationFromValue). */
	relation(other: number): Relation {
		return relationFromValue(this.relationValue(other));
	}

	/** Adds a delta to the relation toward another player, clamped to -100..100. */
	updateRelation(other: number, delta: number): void {
		if (other === this.id) throw new Error(`cannot update relation with self: ${this.id}`);
		const next = Math.min(100, Math.max(-100, this.relationValue(other) + delta));
		this.relations.set(other, next);
	}

	/** Moves every relation toward 0 by the decay step; a value within two steps of 0 snaps to 0 (reference decayRelations). */
	decayRelations(): void {
		const step = BalanceConfig.relationDecayPerTick;
		for (const [other, value] of this.relations) {
			let next = value + -Math.sign(value) * step;
			if (Math.abs(next) < step * 2) next = 0;
			this.relations.set(other, next);
		}
	}

	isAlliedWith(other: number): boolean {
		return other !== this.id && this.allies.has(other);
	}

	/** @returns The ids of the allies, in the order they were allied. */
	allyIds(): number[] {
		return [...this.allies];
	}

	/** Records an alliance with another player on this side only; use allyPlayers in the rules, which set both sides. */
	addAlly(other: number): void {
		if (other === this.id) throw new Error(`cannot ally with self: ${this.id}`);
		this.allies.add(other);
	}

	removeAlly(other: number): void {
		this.allies.delete(other);
	}
}