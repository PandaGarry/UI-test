import type {BasePacket} from "../protocol/packet/BasePacket";
import type {GameActionPacket} from "../protocol/packet/game/GameActionPacket";

/**
 * Outgoing command channel of the simulation (step 2b of docs/ARCHITECTURE-PLAN-2026-10-16.md).
 * The simulation does not depend on networking: the network layer registers the implementation at startup.
 */
export interface CommandChannel {
	/** Sends a packet to the server (throws if the connection is not open). */
	send<T extends BasePacket<T>>(packet: T, force?: boolean): void;
	/** Submits a game action to the server, or applies it locally in a local game. */
	submitAction<T extends GameActionPacket<T>>(action: T): void;
}

let channel: CommandChannel | null = null;

export function setCommandChannel(impl: CommandChannel): void {
	channel = impl;
}

function requireChannel(): CommandChannel {
	if (channel === null) throw new Error("Command channel is not configured");
	return channel;
}

export function sendPacket<T extends BasePacket<T>>(packet: T, force: boolean = false): void {
	requireChannel().send(packet, force);
}

export function submitGameAction<T extends GameActionPacket<T>>(action: T): void {
	requireChannel().submitAction(action);
}
