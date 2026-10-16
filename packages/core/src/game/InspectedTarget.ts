/**
 * The owner of the last tapped tile (-1 = nothing tapped yet, show the client player).
 * The top block of the HUD follows it, as the reference does when the target changes.
 */
type Listener = (owner: number) => void;

const listeners: Listener[] = [];
let inspected = -1;

export function setInspectedOwner(owner: number): void {
	inspected = owner;
	for (const listener of listeners) listener(owner);
}

export function getInspectedOwner(): number {
	return inspected;
}

export function onInspectedOwnerChange(listener: Listener): void {
	listeners.push(listener);
}
