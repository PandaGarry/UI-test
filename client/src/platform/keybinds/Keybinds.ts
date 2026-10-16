import {getSetting, updateSetting} from "../settings/UserSettingManager";
import {
	actionForCode, assignKeybind, parseKeybindOverrides, resolveKeybinds,
	type KeybindAction, type KeybindMap,
} from "./KeybindModel";


/** Bindings currently in effect (defaults merged with the player's choices). */
export function getKeybinds(): KeybindMap {
	return resolveKeybinds(parseKeybindOverrides(getSetting("keybinds")));
}

/**
 * Bind an action to a physical key (or "" to unbind), and save the choice.
 * @param action The action to bind
 * @param code The physical key code
 */
export function setKeybind(action: KeybindAction, code: string): void {
	const overrides = assignKeybind(parseKeybindOverrides(getSetting("keybinds")), action, code);
	updateSetting("keybinds", JSON.stringify(overrides));
}

/**
 * Restore the default bindings.
 */
export function resetKeybinds(): void {
	updateSetting("keybinds", "{}");
}

type KeybindHandler = () => void;
const handlers = new Map<KeybindAction, KeybindHandler>();
// Only one handler per action. Registering again replaces the previous one (e.g. after a hot reload).
export function registerKeybindAction(action: KeybindAction, handler: KeybindHandler): void {
	handlers.set(action, handler);
}

/** Text fields keep their own keys, and browser shortcuts (Ctrl/Alt/Meta combinations) are never intercepted. */
function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
	if (isTypingTarget(event.target)) return;
	const action = actionForCode(getKeybinds(), event.code);
	if (!action) return;
	const handler = handlers.get(action);
	if (!handler) return;
	event.preventDefault();
	handler();
}

document.addEventListener("keydown", onKeyDown);


