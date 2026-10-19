import {BalanceConfig} from "../BalanceConfig";
import {borderManager} from "../BorderManager";
import {gameMap} from "../GameData";
import {playerManager} from "../player/PlayerManager";
import type {Player} from "../player/Player";
import {territoryManager} from "../TerritoryManager";
import {Relation} from "./Relation";
import {allianceBook} from "./Alliances";
import {gameTicker} from "../GameTicker";

/**
 * Diplomacy rules between players: alliances and the relation changes they cause (reference AllianceRequestExecution,
 * BreakAllianceExecution, AttackExecution). The rules are the only place that changes both sides of an alliance.
 * Records of requests and alliances live in Alliances.ts. Not here yet: embargoes, donations (see PLAN-REVISED-2026-10-20).
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
 * Forms an alliance between two players and raises both relations (reference AllianceRequestExecution, accept part).
 * @returns false if the two are already allied or one of them is not alive
 */
export function formAlliance(a: number, b: number, tick: number = gameTicker.getTickCount()): boolean {
	if (a === b || !playerManager.validatePlayer(a) || !playerManager.validatePlayer(b)) return false;
	if (allianceBook.find(a, b) !== null) return false;
	const pa = playerManager.getPlayer(a);
	const pb = playerManager.getPlayer(b);
	allianceBook.createAlliance(a, b, tick);
	pa.addAlly(b);
	pb.addAlly(a);
	pa.updateRelation(b, BalanceConfig.allianceFormRelation);
	pb.updateRelation(a, BalanceConfig.allianceFormRelation);
	return true;
}

export type AllianceRequestOutcome = "sent" | "accepted" | "refused";

/**
 * Player `from` asks `to` for an alliance (reference AllianceRequestExecution).
 * - Refused if the two are allied already, a player is not alive, a request to the same player is pending, or the cooldown runs.
 * - Accepted at once if `to` has a pending request to `from`: that request is answered with an alliance.
 * - Otherwise a pending request is recorded; it is rejected by timeout (see tickAlliances in Alliances.ts).
 */
export function requestAlliance(from: number, to: number, tick: number = gameTicker.getTickCount()): AllianceRequestOutcome {
	if (from === to || !playerManager.validatePlayer(from) || !playerManager.validatePlayer(to)) return "refused";
	if (allianceBook.find(from, to) !== null) return "refused";
	const incoming = allianceBook.pendingRequest(to, from);
	if (incoming) {
		allianceBook.resolveRequest(incoming, "accepted");
		return formAlliance(from, to, tick) ? "accepted" : "refused";
	}
	if (!allianceBook.canSendRequest(from, to, tick)) return "refused";
	allianceBook.addRequest(from, to, tick);
	return "sent";
}

/**
 * The recipient answers a pending request from `requestor`.
 * @returns false if there is no pending request from that player
 */
export function answerAllianceRequest(recipient: number, requestor: number, accept: boolean, tick: number = gameTicker.getTickCount()): boolean {
	const request = allianceBook.pendingRequest(requestor, recipient);
	if (!request) return false;
	if (!accept) {
		allianceBook.resolveRequest(request, "rejected");
		return true;
	}
	allianceBook.resolveRequest(request, "accepted");
	formAlliance(requestor, recipient, tick);
	return true;
}

/**
 * Player `player` asks to extend its alliance with `other` (reference AllianceExtensionExecution). The extension is made
 * when both sides have asked. The reference checks no window here: the prompt window (AllianceRecord, extensionOpen)
 * only decides when the interface offers the extension.
 * @returns "extended", "requested", or null if there is no alliance
 */
export function requestAllianceExtension(player: number, other: number, tick: number = gameTicker.getTickCount()): "extended" | "requested" | null {
	return allianceBook.requestExtension(player, other, tick);
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
	allianceBook.removeAlliance(breaker, other);
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

