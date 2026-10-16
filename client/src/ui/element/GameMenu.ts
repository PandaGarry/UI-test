import {buildPanel} from "../type/UIPanel";
import {buildButton} from "../type/TextNode";
import {hideUIElement, showUIElement} from "../UIManager";
import {tUnsafe} from "../../util/Lang";


// In-game menu (Terron's in-game menu): opened from the gear in the HUD. It holds the entry to settings
// and leaving the match; settings themselves stay in SettingsPanel.

buildPanel("GameMenu")
	.setTitle(tUnsafe("game_menu.title"))
	.add(
		buildButton(tUnsafe("game_menu.settings"), "primary").onClick(() => {
			hideUIElement("GameMenu");
			showUIElement("SettingsPanel");
		}),
	)
	.add(
		buildButton(tUnsafe("game_menu.exit"), "danger").onClick(() => {
			// Leaving drops the match, so it is confirmed first.
			if (window.confirm(tUnsafe("game_menu.exit_confirm"))) window.location.reload();
		}),
	);
