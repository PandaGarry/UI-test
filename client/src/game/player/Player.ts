import type {HSLColor} from "../../util/HSLColor";
import {BalanceConfig} from "../BalanceConfig";
import {growthPerTick} from "../attack/AttackRules";
import {gameMode} from "../GameData";

export class Player {
	readonly id: number;
	readonly name: string;
	readonly baseColor: HSLColor;
	private troops: number = 1000;
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
		const cap = c.capMultiplier * (Math.pow(this.territorySize, c.capTilesExponent) * c.capScale + c.capOffset);
		return this.botCapDivisor() > 1 ? cap / this.botCapDivisor() : cap;
	}

	/** Divisor applied to the troop cap; bots override it (see BalanceConfig.capBotDivisor). */
	protected botCapDivisor(): number {
		return 1;
	}

	/** Whether this player is a bot (bots grow and attack at a lower rate, see AttackRules). */
	isBot(): boolean {
		return false;
	}

	/**
	 * Pay out troop growth for one income interval (BalanceConfig.incomeIntervalTicks ticks).
	 */
	income() {
		const cap = this.troopCap();
		for (let tick = 0; tick < BalanceConfig.incomeIntervalTicks; tick++) {
			if (this.troops >= cap) break;
			this.troops = Math.min(cap, this.troops + growthPerTick(this.troops, cap, this.isBot()));
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
}