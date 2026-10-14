/**
 * Pure keybind model: defaults, stored overrides and conflict rules. No DOM access, so it is unit tested directly.
 *
 * Keys are physical key codes (KeyboardEvent.code, e.g. "KeyT", "BracketLeft"), so bindings stay on the same
 * physical key across keyboard layouts. An empty string means the action is unbound.
 */

export const KEYBIND_ACTIONS = ["attackRatioDown", "attackRatioUp"] as const;
export type KeybindAction = typeof KEYBIND_ACTIONS[number];
export type KeybindMap = Record<KeybindAction, string>;
/** Only what the player changed is stored. Actions missing here use their default. */
export type KeybindOverrides = Partial<KeybindMap>;

export const DEFAULT_KEYBINDS: Readonly<KeybindMap> = {
	attackRatioDown: "BracketLeft",
	attackRatioUp: "BracketRight",
};

/**
 * Parse the stored JSON. Invalid input, unknown actions and non-string values are dropped.
 * @param raw The stored JSON string
 */
export function parseKeybindOverrides(raw: string): KeybindOverrides {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	const result: KeybindOverrides = {};
	for (const action of KEYBIND_ACTIONS) {
		const value = (parsed as Record<string, unknown>)[action];
		if (typeof value === "string") result[action] = value;
	}
	return result;
}

/**
 * Resolve the bindings in effect: defaults, overridden by the player's choices.
 * A default that is now used by a different action the player chose is unbound, so one key never fires two actions.
 * @param overrides The stored overrides
 */
export function resolveKeybinds(overrides: KeybindOverrides): KeybindMap {
	const resolved: KeybindMap = {...DEFAULT_KEYBINDS};
	for (const action of KEYBIND_ACTIONS) {
		const value = overrides[action];
		if (value !== undefined) resolved[action] = value;
	}
	for (const action of KEYBIND_ACTIONS) {
		if (action in overrides) continue;
		const code = resolved[action];
		const clashes = KEYBIND_ACTIONS.some(other => other !== action && resolved[other] === code && code !== "");
		if (clashes) resolved[action] = "";
	}
	return resolved;
}

/**
 * Bind an action to a key. The key is taken away from any other action that had it.
 * @param overrides The current stored overrides
 * @param action The action to bind
 * @param code The physical key code, or "" to unbind the action
 * @returns The new overrides to store
 */
export function assignKeybind(overrides: KeybindOverrides, action: KeybindAction, code: string): KeybindOverrides {
	const resolved = resolveKeybinds(overrides);
	const next: KeybindMap = {...resolved, [action]: code};
	if (code !== "") {
		for (const other of KEYBIND_ACTIONS) {
			if (other !== action && next[other] === code) next[other] = "";
		}
	}
	// Store every action that differs from its default, so defaults can still change later.
	const stored: KeybindOverrides = {};
	for (const other of KEYBIND_ACTIONS) {
		if (next[other] !== DEFAULT_KEYBINDS[other]) stored[other] = next[other];
	}
	return stored;
}

/**
 * Find the action bound to a key code.
 * @param bindings The resolved bindings
 * @param code The physical key code
 * @returns The action, or null when no action uses the key
 */
export function actionForCode(bindings: KeybindMap, code: string): KeybindAction | null {
	if (code === "") return null;
	return KEYBIND_ACTIONS.find(action => bindings[action] === code) ?? null;
}

/**
 * Human readable name of a key code, for buttons and labels.
 * @param code The physical key code
 */
export function formatKeyCode(code: string): string {
	if (code === "") return "";
	const named: Record<string, string> = {
		BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/",
		Semicolon: ";", Quote: "'", Backquote: "`", Backslash: "\\", Space: "Space",
		ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
	};
	if (code in named) return named[code];
	if (code.startsWith("Key")) return code.slice(3);
	if (code.startsWith("Digit")) return code.slice(5);
	if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
	return code;
}
