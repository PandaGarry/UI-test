import {BalanceConfig, type GameDifficulty} from "../BalanceConfig";
import {gameTicker} from "../GameTicker";
import {gameMode} from "../GameData";
import {random} from "../Random";
import {attackActionHandler} from "../attack/AttackActionHandler";
import {playerManager} from "../player/PlayerManager";
import type {Player} from "../player/Player";
import {allianceBook} from "../relation/Alliances";
import {answerAllianceRequest, breakAlliance, neighbourIds, requestAlliance, requestAllianceExtension, startEmbargo, stopEmbargo} from "../relation/Diplomacy";
import {Relation} from "../relation/Relation";
import type {NationPlayer} from "./NationPlayer";

/**
 * Alliance decisions of the states (reference NationAllianceBehavior, FFA rules). The states decide with their own
 * numbers (BalanceConfig.nationAlliance) and the shared random generator, so the same seed gives the same game.
 *
 * Not ported here, because the game has no such part yet (see PLAN-REVISED-2026-10-20):
 * - traitors (a player that broke an alliance) and their branches;
 * - team games (shouldRejectInTeamGame) — the game is FFA only;
 * - structures in the juiciness score (findJuiciestTarget counts them; here only the troop gap and the tile count);
 * - emoji replies (NationEmojiBehavior, step R7);
 * - the spawn-phase rule that rejects requests sent before the game starts.
 *
 * Embargoes (reference NationExecution.updateRelationsFromEmbargos and handleEmbargoesToHostileNations) are here too.
 * The team branch is not ported (FFA only). Trade is not in the game, so an embargo only moves relations.
 */

/** A roll in 0..99 is below `percent` (reference random.chance). */
function chance(percent: number): boolean {
	return random.nextInt(100) < percent;
}

/** Inclusive draw in min..max (reference random.nextInt(min, max)). */
function between(min: number, max: number): number {
	return min + random.nextInt(max - min + 1);
}

function isNation(id: number): boolean {
	return playerManager.getNations().some(nation => nation.id === id);
}

function isHuman(player: Player): boolean {
	return !playerManager.isBot(player.id) && !isNation(player.id);
}

/** Troops the player has, plus the troops of its attacks that are on their way (reference troops + outgoing attacks). */
function totalTroops(player: Player): number {
	return player.getTroops() + attackActionHandler.outgoingAttacks(player.id).reduce((sum, attack) => sum + attack.getTroops(), 0);
}

/**
 * The state that leads by tiles, if it has at least `factor` times the tiles of the runner-up (reference findRunawayLeader).
 * Only the players that are not bots count.
 */
function runawayLeader(difficulty: GameDifficulty): Player | null {
	const factor = BalanceConfig.nationAlliance[difficulty].runawayFactor;
	if (factor === null) return null;
	let leader: Player | null = null;
	let runnerUp: Player | null = null;
	for (const player of playerManager.getPlayers()) {
		if (playerManager.isBot(player.id)) continue;
		if (leader === null || player.getTerritorySize() > leader.getTerritorySize()) {
			runnerUp = leader;
			leader = player;
		} else if (runnerUp === null || player.getTerritorySize() > runnerUp.getTerritorySize()) {
			runnerUp = player;
		}
	}
	if (leader === null || runnerUp === null) return null;
	return leader.getTerritorySize() >= runnerUp.getTerritorySize() * factor ? leader : null;
}

/** Reference getAllianceDecision: whether the state takes an alliance with `other`. */
function allianceDecision(self: NationPlayer, other: Player): boolean {
	const difficulty = self.difficulty;
	const table = BalanceConfig.nationAlliance[difficulty];
	if (chance(table.confusedPercent)) return chance(2);
	if (tooManyAlliances(difficulty, other)) return false;
	if (runawayLeader(difficulty) === other) return false;
	if (isThreat(self, other)) return true;
	if (self.relation(other.id) < Relation.Neutral) return false;
	if (self.relation(other.id) === Relation.Friendly && (table.friendlyMinRoll === null || random.nextInt(100) >= table.friendlyMinRoll)) return true;
	if (alreadyEnoughAlliances(self, other)) return false;
	if (isEarlygame(difficulty)) return true;
	return isSimilarlyStrong(self, other);
}

/** Reference hasTooManyAlliances: Hard and Impossible refuse a partner that already has many allies. */
function tooManyAlliances(difficulty: GameDifficulty, other: Player): boolean {
	const share = BalanceConfig.nationAlliance[difficulty].tooManyAllianceShare;
	if (share === null) return false;
	const humanSide = playerManager.getPlayers().filter(player => !playerManager.isBot(player.id)).length;
	return other.allyIds().length >= humanSide * share;
}

/**
 * Reference isAlliancePartnerThreat: the partner is so strong that the state accepts it regardless of relations.
 * Easy sees no threat; the others compare troops, troop caps and tiles as the reference does.
 */
function isThreat(self: NationPlayer, other: Player): boolean {
	switch (self.difficulty) {
		case "easy":
			return false;
		case "medium":
			return other.getTroops() > self.getTroops() * 2.5;
		case "hard":
			return other.getTroops() > self.getTroops() && other.troopCap() > self.troopCap() * 2;
		case "impossible":
			return (
				other.getTroops() > self.getTroops() * 1.5 ||
				(other.getTroops() > self.getTroops() && other.troopCap() > self.troopCap() * 1.5) ||
				(other.getTroops() > self.getTroops() && other.getTerritorySize() > self.getTerritorySize() * 1.5)
			);
	}
}

/**
 * Reference checkAlreadyEnoughAlliances. Hard and Impossible first try not to ally with all their human-side neighbours
 * (if they have two or more of them); then they stop at a random alliance count.
 */
function alreadyEnoughAlliances(self: NationPlayer, other: Player): boolean {
	const difficulty = self.difficulty;
	const range = BalanceConfig.nationAlliance[difficulty].allianceCountRange;
	if (difficulty === "easy" || range === null) return false;
	if (difficulty === "hard" || difficulty === "impossible") {
		const bordering = neighbourIds(self).map(id => playerManager.getPlayer(id)).filter(isHuman);
		const friends = bordering.filter(player => self.isAlliedWith(player.id));
		if (bordering.length >= 2 && bordering.some(player => player.id === other.id)) {
			return bordering.length <= friends.length + 1;
		}
	}
	return self.allyIds().length >= between(range[0], range[1]);
}

/** Reference isEarlygame: before the early ticks the state accepts with the early chance. */
function isEarlygame(difficulty: GameDifficulty): boolean {
	const table = BalanceConfig.nationAlliance[difficulty];
	return gameTicker.getTickCount() < table.earlyTicks && chance(table.earlyAcceptPercent);
}

/** Reference isAlliancePartnerSimilarlyStrong: the partner is about as strong as the state. */
function isSimilarlyStrong(self: NationPlayer, other: Player): boolean {
	const table = BalanceConfig.nationAlliance[self.difficulty];
	const playerTotal = totalTroops(self);
	const otherTotal = totalTroops(other);
	const troopThreshold = playerTotal * (between(table.similarTroopRange[0], table.similarTroopRange[1]) / 100);
	const tileThreshold = self.getTerritorySize() * (between(table.similarTileRange[0], table.similarTileRange[1]) / 100);
	const comparableTroops = otherTotal > troopThreshold;
	const comparableTiles = other.getTerritorySize() > tileThreshold && otherTotal > playerTotal * 0.5;
	return comparableTroops || comparableTiles;
}

/**
 * Handles the requests that wait for an answer from the state (reference handleAllianceRequests).
 * Each request is accepted or rejected by allianceDecision; the state answers in the order the requests came.
 */
export function handleIncomingRequests(self: NationPlayer): void {
	for (const request of allianceBook.incomingRequests(self.id)) {
		const requestor = playerManager.getPlayer(request.requestor);
		answerAllianceRequest(self.id, request.requestor, allianceDecision(self, requestor));
	}
}

/**
 * Answers an extension that the other side has asked for and the state has not (reference handleAllianceExtensionRequests).
 * The state asks for the extension too when its decision is positive.
 */
export function handleExtensionRequests(self: NationPlayer): void {
	for (const other of self.allyIds()) {
		const record = allianceBook.find(self.id, other);
		if (!record) continue;
		const onlyOther = record.requestor === self.id ? record.extendRecipient && !record.extendRequestor : record.extendRequestor && !record.extendRecipient;
		if (!onlyOther) continue;
		if (allianceDecision(self, playerManager.getPlayer(other))) {
			requestAllianceExtension(self.id, other);
		}
	}
}

/**
 * Sends alliance requests to bordering enemies (reference maybeSendAllianceRequests). Easy states send to bots too;
 * the others only to human-side players. A request is sent with requestPercent chance per enemy.
 */
export function maybeSendRequests(self: NationPlayer, borderingEnemies: readonly Player[]): void {
	const requestPercent = BalanceConfig.nationAlliance[self.difficulty].requestPercent;
	for (const enemy of borderingEnemies) {
		if (!chance(requestPercent)) continue;
		if (self.difficulty !== "easy" && playerManager.isBot(enemy.id)) continue;
		if (!allianceDecision(self, enemy)) continue;
		requestAlliance(self.id, enemy.id);
	}
}

/** The ally with the largest juiciness: troop gap below its cap and tile count, both normalised over the candidates. */
export function juiciestAlly(candidates: readonly Player[]): Player | null {
	if (candidates.length === 0) return null;
	const gaps = candidates.map(p => (p.troopCap() > 0 ? 1 - p.getTroops() / p.troopCap() : 0));
	const tiles = candidates.map(p => p.getTerritorySize());
	const normalise = (value: number, values: number[]): number => {
		const min = Math.min(...values);
		const max = Math.max(...values);
		return max > min ? (value - min) / (max - min) : 0;
	};
	let best: Player | null = null;
	let bestScore = -Infinity;
	for (let i = 0; i < candidates.length; i++) {
		const score = normalise(gaps[i]!, gaps) + normalise(tiles[i]!, tiles);
		if (score > bestScore) {
			bestScore = score;
			best = candidates[i]!;
		}
	}
	return best;
}

/**
 * Decides whether the state breaks an alliance to attack its ally (reference maybeBetray, without the traitor branches).
 * Hard and Impossible betray their juiciest ally when the allies around are weak; Easy and Medium betray weak allies
 * (Easy does not betray humans); every non-Easy state betrays its only bordering player when much stronger than it.
 * @returns The id of the betrayed ally, or null if nothing was betrayed
 */
export function maybeBetray(self: NationPlayer, borderingFriends: readonly Player[], borderingEnemies: readonly Player[]): number | null {
	const difficulty = self.difficulty;
	const table = BalanceConfig.nationAlliance[difficulty];
	const juiciest = juiciestAlly(borderingFriends.filter(friend => self.isAlliedWith(friend.id)));
	for (const other of borderingFriends) {
		if (!self.isAlliedWith(other.id)) continue;
		const betrays =
			((difficulty === "hard" || difficulty === "impossible") && juiciest === other && isSafeToBetray(self, other, borderingFriends, borderingEnemies)) ||
			(table.betrayWeakRatio !== null &&
				!(difficulty === "easy" && isHuman(other)) &&
				self.getTroops() >= other.getTroops() * table.betrayWeakRatio) ||
			(difficulty !== "easy" && borderingFriends.length + borderingEnemies.length === 1 && other.getTroops() * 3 < self.getTroops());
		if (betrays) {
			breakAlliance(self.id, other.id);
			return other.id;
		}
	}
	return null;
}

/** Reference isSafeToBetray: the target and the other threats around together have under a third of the state's troops. */
function isSafeToBetray(self: NationPlayer, target: Player, borderingFriends: readonly Player[], borderingEnemies: readonly Player[]): boolean {
	const otherAllies = borderingFriends.filter(friend => friend.id !== target.id && self.isAlliedWith(friend.id));
	const threats = [target, ...borderingEnemies, ...otherAllies];
	const threatTroops = threats.reduce((sum, threat) => sum + totalTroops(threat), 0);
	return threatTroops < self.getTroops() * 0.33;
}

/** Players that border `self` and are not its allies, the enemies for the requests and the betrayal. */
export function borderingPlayers(self: NationPlayer): {friends: Player[]; enemies: Player[]} {
	const friends: Player[] = [];
	const enemies: Player[] = [];
	for (const id of neighbourIds(self)) {
		const player = playerManager.getPlayer(id);
		if (self.isAlliedWith(id)) friends.push(player);
		else if (gameMode.canAttack(self.id, id)) enemies.push(player);
	}
	return {friends, enemies};
}

/**
 * A state lowers its relation toward a player with a manual embargo against it, once, and restores it when the embargo
 * ends (reference NationExecution.updateRelationsFromEmbargos: -20).
 */
export function applyEmbargoRelations(self: NationPlayer): void {
	const malus = BalanceConfig.embargoRelationMalus;
	for (const other of self.manualEmbargoersOfMe()) {
		if (other === self.id || self.isEmbargoMalusApplied(other)) continue;
		self.updateRelation(other, malus);
		self.setEmbargoMalusApplied(other, true);
	}
	for (const other of self.embargoMalusTargets()) {
		if (playerManager.getPlayer(other).hasManualEmbargoAgainst(self.id)) continue;
		self.updateRelation(other, -malus);
		self.setEmbargoMalusApplied(other, false);
	}
}

/**
 * A state starts a manual embargo against a player it is hostile to, and ends it when relations recover. On Hard and
 * Impossible the embargo does not end at Neutral; on Impossible it does not end at Friendly either (reference
 * NationExecution.handleEmbargoesToHostileNations).
 * Only the players in the state's relation table can be at Hostile or below, so the loop runs over those.
 */
export function handleEmbargoesToHostileNations(self: NationPlayer): void {
	const difficulty = self.difficulty;
	const isHigher = difficulty === "hard" || difficulty === "impossible";
	for (const other of self.knownPlayerIds()) {
		if (other === self.id || !playerManager.validatePlayer(other)) continue;
		const relation = self.relation(other);
		if (relation <= Relation.Hostile && !self.hasEmbargoAgainst(other) && !self.isAlliedWith(other)) {
			startEmbargo(self.id, other, false);
		} else if (relation >= Relation.Neutral && self.hasEmbargoAgainst(other) && !isHigher) {
			stopEmbargo(self.id, other);
		} else if (relation >= Relation.Friendly && self.hasEmbargoAgainst(other) && difficulty !== "impossible") {
			stopEmbargo(self.id, other);
		}
	}
}
