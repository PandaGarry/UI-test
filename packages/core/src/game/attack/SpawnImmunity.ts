import type {Player} from "../player/Player";
import {spawnManager} from "../player/SpawnManager";
import {gameTicker} from "../GameTicker";

/** Ticks after the start during which a human player is immune (reference `spawnImmunityDuration`). */
export const SPAWN_IMMUNITY_TICKS = 50;

/**
 * A human player is immune while the spawn phase runs and for the first SPAWN_IMMUNITY_TICKS ticks.
 * Bots are never immune (reference `PlayerImpl.isImmune`: only human players have spawn immunity here).
 */
export function isSpawnImmune(player: Player): boolean {
	return isImmuneAt(player.isBot(), spawnManager.isSelecting, gameTicker.getTickCount());
}

/** The immunity rule on plain values (pure, so it can be tested without the game state). */
export function isImmuneAt(isBot: boolean, selecting: boolean, tick: number): boolean {
	if (isBot) return false;
	return selecting || tick < SPAWN_IMMUNITY_TICKS;
}

/**
 * A human attacker cannot attack an immune player. Bots ignore immunity, as in the reference
 * (`PlayerImpl.canAttackPlayer`: only human attackers respect PVP immunity).
 */
export function immunityBlocksAttack(attacker: Player, target: Player): boolean {
	return !attacker.isBot() && isSpawnImmune(target);
}
