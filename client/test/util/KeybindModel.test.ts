import {describe, test} from "node:test";
import {deepEqual, equal} from "node:assert";
import {
	actionForCode, assignKeybind, DEFAULT_KEYBINDS, formatKeyCode, parseKeybindOverrides, resolveKeybinds,
} from "../../src/platform/keybinds/KeybindModel";

describe("KeybindModel", () => {
	test("invalid stored data is ignored", () => {
		deepEqual(parseKeybindOverrides("not json"), {});
		deepEqual(parseKeybindOverrides("[1,2]"), {});
		deepEqual(parseKeybindOverrides("null"), {});
		deepEqual(parseKeybindOverrides(JSON.stringify({attackRatioUp: 5, unknownAction: "KeyZ", attackRatioDown: "KeyX"})), {attackRatioDown: "KeyX"});
	});

	test("defaults apply when nothing is stored", () => {
		deepEqual(resolveKeybinds({}), DEFAULT_KEYBINDS);
	});

	test("an override replaces the default, an empty string unbinds", () => {
		deepEqual(resolveKeybinds({attackRatioUp: "KeyY"}), {attackRatioDown: "BracketLeft", attackRatioUp: "KeyY"});
		deepEqual(resolveKeybinds({attackRatioUp: ""}), {attackRatioDown: "BracketLeft", attackRatioUp: ""});
	});

	test("a default used by another chosen action is unbound, so one key never fires two actions", () => {
		// The player put "BracketLeft" on attackRatioUp. attackRatioDown still has it as its default.
		deepEqual(resolveKeybinds({attackRatioUp: "BracketLeft"}), {attackRatioDown: "", attackRatioUp: "BracketLeft"});
	});

	test("binding an action takes the key away from the action that had it", () => {
		const stored = assignKeybind({}, "attackRatioUp", "BracketLeft");
		deepEqual(resolveKeybinds(stored), {attackRatioDown: "", attackRatioUp: "BracketLeft"});
	});

	test("binding to another action's default unbinds that action and stores it", () => {
		const stored = assignKeybind({}, "attackRatioDown", "BracketRight");
		deepEqual(stored, {attackRatioDown: "BracketRight", attackRatioUp: ""});
		deepEqual(resolveKeybinds(stored), {attackRatioDown: "BracketRight", attackRatioUp: ""});
	});

	test("only changed actions are stored", () => {
		deepEqual(assignKeybind({}, "attackRatioUp", "KeyY"), {attackRatioUp: "KeyY"});
		deepEqual(assignKeybind({attackRatioUp: "KeyY"}, "attackRatioUp", "BracketRight"), {});
	});

	test("unbinding an action keeps it unbound after reload", () => {
		const stored = assignKeybind({}, "attackRatioDown", "");
		deepEqual(resolveKeybinds(stored), {attackRatioDown: "", attackRatioUp: "BracketRight"});
	});

	test("actionForCode finds the action or null", () => {
		const bindings = resolveKeybinds({});
		equal(actionForCode(bindings, "BracketLeft"), "attackRatioDown");
		equal(actionForCode(bindings, "KeyA"), null);
		equal(actionForCode(bindings, ""), null);
	});

	test("key names are readable", () => {
		equal(formatKeyCode("KeyT"), "T");
		equal(formatKeyCode("Digit5"), "5");
		equal(formatKeyCode("BracketLeft"), "[");
		equal(formatKeyCode("NumpadAdd"), "Num Add");
		equal(formatKeyCode(""), "");
	});
});
