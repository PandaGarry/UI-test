import {BalanceConfig} from "../BalanceConfig";

/**
 * Book of alliance records and alliance requests (reference AllianceImpl, AllianceRequestImpl, AllianceRequestExecution,
 * AllianceExtensionExecution). It holds only player ids and ticks: the relation changes and the player sides are
 * updated by the rules in Diplomacy.ts and PlayerManager, so this module imports nothing from the game state.
 *
 * Rules (reference numbers in BalanceConfig, 10 ticks per second):
 * - A request waits allianceRequestDurationTicks; then it is rejected.
 * - A player cannot send a second request to the same player within allianceRequestCooldownTicks.
 * - If the recipient already has a pending request to the sender, the new request is accepted at once.
 * - An alliance expires at expiresAt; both sides may extend it from allianceExtensionPromptTicks before that.
 *   An extension is made only when both sides ask for it; then the expiry moves by allianceDurationTicks.
 */

export interface AllianceRecord {
	readonly requestor: number;
	readonly recipient: number;
	readonly createdAt: number;
	expiresAt: number;
	extendRequestor: boolean;
	extendRecipient: boolean;
}

export interface AllianceRequest {
	readonly requestor: number;
	readonly recipient: number;
	readonly createdAt: number;
	status: "pending" | "accepted" | "rejected";
}

/** Result of one tick: the alliances that ended by expiry and the requests that were rejected by timeout. */
export interface AllianceTickResult {
	readonly expired: readonly [number, number][];
	readonly rejected: readonly AllianceRequest[];
}

function pairKey(a: number, b: number): string {
	return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export class AllianceBook {
	private alliances = new Map<string, AllianceRecord>();
	private requests: AllianceRequest[] = [];
	/** Tick of the last request sent from one player to another (key: "from>to"). */
	private lastSent = new Map<string, number>();

	reset(): void {
		this.alliances = new Map();
		this.requests = [];
		this.lastSent = new Map();
	}

	/** @returns The alliance between two players, or null. */
	find(a: number, b: number): AllianceRecord | null {
		return this.alliances.get(pairKey(a, b)) ?? null;
	}

	/** @returns The pending request from `from` to `to`, or null. */
	pendingRequest(from: number, to: number): AllianceRequest | null {
		return this.requests.find(r => r.status === "pending" && r.requestor === from && r.recipient === to) ?? null;
	}

	/** @returns The pending requests addressed to a player, oldest first. */
	incomingRequests(player: number): AllianceRequest[] {
		return this.requests.filter(r => r.status === "pending" && r.recipient === player);
	}

	/**
	 * Whether `from` may send a new request to `to` now (reference canSendAllianceRequest, without the alive and
	 * friendly checks, which the caller makes). A pending request to the same player blocks a second one; so does the cooldown.
	 */
	canSendRequest(from: number, to: number, tick: number): boolean {
		if (from === to) return false;
		if (this.pendingRequest(from, to) !== null) return false;
		const last = this.lastSent.get(`${from}>${to}`);
		return last === undefined || tick - last >= BalanceConfig.allianceRequestCooldownTicks;
	}

	/** Records a new pending request and the time it was sent. */
	addRequest(from: number, to: number, tick: number): AllianceRequest {
		const request: AllianceRequest = {requestor: from, recipient: to, createdAt: tick, status: "pending"};
		this.requests.push(request);
		this.lastSent.set(`${from}>${to}`, tick);
		return request;
	}

	/** Answers a pending request: it leaves the pending list with the given status. @returns false if it was not pending */
	resolveRequest(request: AllianceRequest, status: "accepted" | "rejected"): boolean {
		if (request.status !== "pending") return false;
		request.status = status;
		this.requests = this.requests.filter(r => r !== request);
		return true;
	}

	/** Creates the alliance record with its expiry (the caller updates the players and relations). */
	createAlliance(a: number, b: number, tick: number): AllianceRecord {
		const record: AllianceRecord = {
			requestor: a,
			recipient: b,
			createdAt: tick,
			expiresAt: tick + BalanceConfig.allianceDurationTicks,
			extendRequestor: false,
			extendRecipient: false,
		};
		this.alliances.set(pairKey(a, b), record);
		return record;
	}

	/** Removes an alliance record (break, expiry or a dead side). @returns Whether one existed. */
	removeAlliance(a: number, b: number): boolean {
		return this.alliances.delete(pairKey(a, b));
	}

	/**
	 * Records that `player` asks to extend the alliance with `other`. When both sides have asked, the alliance is extended.
	 * @returns "extended" when the expiry moved, "requested" when the other side still has to answer, null without an alliance
	 */
	requestExtension(player: number, other: number, tick: number): "extended" | "requested" | null {
		const record = this.find(player, other);
		if (!record) return null;
		if (player === record.requestor) record.extendRequestor = true;
		else record.extendRecipient = true;
		if (record.extendRequestor && record.extendRecipient) {
			record.extendRequestor = false;
			record.extendRecipient = false;
			record.expiresAt = tick + BalanceConfig.allianceDurationTicks;
			return "extended";
		}
		return "requested";
	}

	/** Whether the extension prompt is open for the alliance (within the prompt window before expiry). */
	extensionOpen(record: AllianceRecord, tick: number): boolean {
		return record.expiresAt <= tick + BalanceConfig.allianceExtensionPromptTicks;
	}

	/** Removes every alliance and request of a player (the player is out of the game). */
	removePlayer(player: number): number[] {
		const others: number[] = [];
		for (const [key, record] of this.alliances) {
			if (record.requestor !== player && record.recipient !== player) continue;
			this.alliances.delete(key);
			others.push(record.requestor === player ? record.recipient : record.requestor);
		}
		this.requests = this.requests.filter(r => r.status !== "pending" || (r.requestor !== player && r.recipient !== player));
		return others;
	}

	/**
	 * Advances the book by one tick: rejects requests that waited too long and expires alliances whose time is up.
	 * @returns The expired alliances and the rejected requests, in their creation order
	 */
	tick(tick: number): AllianceTickResult {
		const rejected: AllianceRequest[] = [];
		for (const request of this.requests) {
			if (request.status === "pending" && tick - request.createdAt > BalanceConfig.allianceRequestDurationTicks) {
				request.status = "rejected";
				rejected.push(request);
			}
		}
		this.requests = this.requests.filter(r => r.status === "pending");

		const expired: [number, number][] = [];
		for (const [key, record] of this.alliances) {
			if (record.expiresAt > tick) continue;
			this.alliances.delete(key);
			expired.push([record.requestor, record.recipient]);
		}
		return {expired, rejected};
	}
}

export const allianceBook = new AllianceBook();

/**
 * Advances alliances by one tick: alliances whose time is up end silently (reference PlayerExecution, no relation change),
 * requests that waited too long are rejected, and the alliances of players that are out of the game end.
 * Called by PlayerManager.tick, which passes the players by id.
 */
export function tickAlliances(tick: number, players: readonly {id: number; isAlive(): boolean; removeAlly(other: number): void}[]): void {
	const result = allianceBook.tick(tick);
	for (const [a, b] of result.expired) {
		players[a]?.removeAlly(b);
		players[b]?.removeAlly(a);
	}
	for (const player of players) {
		if (player.isAlive()) continue;
		for (const other of allianceBook.removePlayer(player.id)) {
			players[other]?.removeAlly(player.id);
		}
	}
}
