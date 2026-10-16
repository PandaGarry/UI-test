import {describe, test} from "node:test";
import {deepEqual} from "node:assert";
import {sendPacket, setCommandChannel, submitGameAction} from "@frontline/core/game/CommandChannel";

// Step 2b: the simulation sends commands through a channel that the network layer registers.
describe("CommandChannel", () => {
	test("forwards send and submit calls to the registered implementation with the same arguments", () => {
		const calls: unknown[][] = [];
		setCommandChannel({
			send: (packet, force) => { calls.push(["send", packet, force]); },
			submitAction: (action) => { calls.push(["submit", action]); },
		});
		const packet = {id: 1} as never;
		const action = {id: 2} as never;
		sendPacket(packet);
		sendPacket(packet, true);
		submitGameAction(action);
		deepEqual(calls, [
			["send", packet, false],
			["send", packet, true],
			["submit", action],
		]);
	});
});
