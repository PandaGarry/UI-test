import {buildContainer, type ContentField} from "./ContentField";
import {buildButton, buildParagraph, type TextNode} from "./TextNode";
import {KEYBIND_ACTIONS, formatKeyCode, type KeybindAction} from "../../util/keybinds/KeybindModel";
import {getKeybinds, resetKeybinds, setKeybind} from "../../util/keybinds/Keybinds";
import {tUnsafe} from "../../util/Lang";

//@module ui

// Keys that cannot be bound on their own: they are modifiers and are read together with other keys.
const MODIFIER_CODE = /^(Shift|Control|Alt|Meta)(Left|Right)$/;

/**
 * One row per action: its name and a button showing the bound key.
 * Clicking the button waits for the next key press. Escape cancels, Backspace or Delete clears the binding.
 * @param action The action to show
 * @param refreshers Collects the row's refresh callback, so all rows can update after any change
 */
function buildKeybindRow(action: KeybindAction, refreshers: (() => void)[]): ContentField {
	const button: TextNode = buildButton("", "secondary", "keybind-button");
	const element = button.getElement();

	const refresh = () => {
		element.classList.remove("is-capturing");
		element.textContent = formatKeyCode(getKeybinds()[action]) || tUnsafe("controls.unbound");
	};
	refreshers.push(refresh);
	refresh();

	button.onClick(() => {
		element.classList.add("is-capturing");
		element.textContent = tUnsafe("controls.press");
		const capture = (event: KeyboardEvent) => {
			if (MODIFIER_CODE.test(event.code)) return;
			// Swallow the key here, so pressing it does not also act on the map or the menu.
			event.preventDefault();
			event.stopPropagation();
			window.removeEventListener("keydown", capture, true);
			if (event.code !== "Escape") {
				setKeybind(action, event.code === "Backspace" || event.code === "Delete" ? "" : event.code);
				refreshers.forEach(r => r());
			} else {
				refresh();
			}
		};
		window.addEventListener("keydown", capture, true);
	});

	return buildContainer("keybind-row").add(buildParagraph(tUnsafe(`controls.${action}`))).add(button);
}

/**
 * The controls section of the settings panel: a row for each rebindable action, and a reset button.
 */
export function buildKeybindList(): ContentField {
	const list = buildContainer("keybind-list");
	const refreshers: (() => void)[] = [];
	for (const action of KEYBIND_ACTIONS) {
		list.add(buildKeybindRow(action, refreshers));
	}
	const reset = buildButton(tUnsafe("controls.reset"), "secondary", "btn-block").onClick(() => {
		resetKeybinds();
		refreshers.forEach(r => r());
	});
	list.add(reset);
	list.add(buildParagraph(tUnsafe("controls.hint"), "keybind-hint"));
	return list;
}
