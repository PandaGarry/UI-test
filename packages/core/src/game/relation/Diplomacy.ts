import {BalanceConfig} from "../BalanceConfig";
import {borderManager} from "../BorderManager";
import {gameMap} from "../GameData";
import {playerManager} from "../player/PlayerManager";
import type {Player} from "../player/Player";
import {territoryManager} from "../TerritoryManager";
import {Relation} from "./Relation";

/**
 * Diplomacy rules between players: alliances and the relation changes they cause (reference AllianceRequestExecution,
 * BreakAllianceExecution, AttackExecution). The rules are the only place that changes both sides of an alliance.
 * Not here yet: alliance requests from humans (UI), alliance expiry and extension, embargoes, donations (see PLAN-REVISED-2026-10-20).
 */

/** Players that own a tile next to one of the player's border tiles (reference Player.nearby, without teams). */
export function neighbourIds(player: Player): number[] {
	const found = new Set<number>();
	for (const border of borderManager.getBorderTiles(player.id)) {
		gameMap.onNeighbors(border, neighbor => {
			const owner = territoryManager.getOwner(neighbor);
			if (owner !== player.id && owner !== territoryManager.OWNER_NONE) found.add(owner);
		});
	}
	return [...found].sort((a, b) => a - b);
}

/**
 * Forms an alliance between two players and raises both relations (reference AllianceRequestExecution).
 * @returns false if the two are already allied or one of them is not a player that is alive
 */
export function formAlliance(a: number, b: number): boolean {
	if (a === b || !playerManager.validatePlayer(a) || !playerManager.validatePlayer(b)) return false;
	const pa = playerManager.getPlayer(a);
	const pb = playerManager.getPlayer(b);
	if (pa.isAlliedWith(b)) return false;
	pa.addAlly(b);
	pb.addAlly(a);
	pa.updateRelation(b, BalanceConfig.allianceFormRelation);
	pb.updateRelation(a, BalanceConfig.allianceFormRelation);
	return true;
}

/**
 * Breaks an alliance. The other side loses relation toward the breaker, and so do the breaker's neighbours
 * (reference BreakAllianceExecution: -100 for the other side, -40 for each neighbour except the other side).
 * @returns false if the two were not allied
 */
export function breakAlliance(breaker: number, other: number): boolean {
	if (!playerManager.validatePlayer(breaker) || !playerManager.validatePlayer(other)) return false;
	const pb = playerManager.getPlayer(breaker);
	if (!pb.isAlliedWith(other)) return false;
	pb.removeAlly(other);
	playerManager.getPlayer(other).removeAlly(breaker);
	playerManager.getPlayer(other).updateRelation(breaker, BalanceConfig.allianceBreakRelation);
	for (const neighbour of neighbourIds(pb)) {
		if (neighbour === other || neighbour === breaker) continue;
		if (!playerManager.validatePlayer(neighbour)) continue;
		playerManager.getPlayer(neighbour).updateRelation(breaker, BalanceConfig.allianceBreakNeighbourRelation);
	}
	return true;
}

/**
 * Relation change when a new attack on a player starts (reference AttackExecution.init, relation part).
 * Hitting back at a player the attacker is hostile to does not anger that player, except on Easy.
 * @param attacker The attacking player
 * @param defender The attacked player (never terra nullius)
 */
export function onAttackStarted(attacker: Player, defender: Player): void {
	const difficulty = playerManager.getDifficulty();
	if (difficulty !== "easy" && attacker.relation(defender.id) === Relation.Hostile) return;
	defender.updateRelation(attacker.id, BalanceConfig.attackRelationPenalty[difficulty]);
}
