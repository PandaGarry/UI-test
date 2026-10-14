import {getDefaultMapIds} from "../../map/MapRegistry";
import {getSetting, getSettingObject} from "../../util/settings/UserSettingManager";
import {GameModeIds} from "../../network/protocol/util/GameTypeIds";
import {registerClickListener} from "../UIEventResolver";
import {loadValidatedInput} from "../type/ValidatedInput";
import {showPanel} from "../type/UIPanel";
import {hideAllUIElements, loadStaticElement, showUIElement} from "../UIManager";
import {t, ui, applyLanguage} from "../../util/Lang";
import {buildButton, displayAlert} from "../type/TextNode";
import {buildContainer} from "../type/ContentField";
import {gameLoadFailRegistry, tryStartGame} from "../../game/GameLoader";
import {BalanceConfig} from "../../game/BalanceConfig";
//import {openMultiplayerLobby} from "./MultiplayerLobby";

//@module ui

loadStaticElement("MainMenu")

//const btnStartMultiplayer: HTMLButtonElement = (window.document.getElementById("btnStartMultiplayer") as HTMLButtonElement);
const btnStartSingleplayer: HTMLButtonElement = (window.document.getElementById("btnStartSingleplayer") as HTMLButtonElement);

const playerNameValidationExp: RegExp = /^[a-zA-Z0-9\u00A0-\u00FF\u0100-\u024F\u1E00-\u1EFF\-_. ({)}<>]*$/;

//registerClickListener("btnStartMultiplayer", () => openMultiplayerLobby());

registerClickListener("btnStartSingleplayer", () => {
	// Step 1: match setup (bot count), Step 2: map selection.
	const showMapSelect = (botCount: number) => showPanel(t("menu.map.select"), buildContainer("grid", "grid-3col").setContent(...getDefaultMapIds().map(map =>
		buildButton(map[1].name).onClick(() => tryStartGame(map[0], GameModeIds.FFA, 23452345, [{name: getSetting("player-name")}], 0, true, botCount + 1)))
	));
	showPanel(t("menu.bots.select"), buildContainer("grid", "grid-3col").setContent(...BalanceConfig.botCountOptions.map(count =>
		buildButton(String(count)).onClick(() => showMapSelect(count)))
	));
});

gameLoadFailRegistry.register(() => {
	hideAllUIElements();
	showUIElement("MainMenu");
	displayAlert("danger", t("game.load.fail"), "slow")
});

// Localize the static menu texts and wire the RU/EN switcher (reload applies it everywhere).
btnStartSingleplayer.textContent = ui("menu.singleplayer");
const playerNameInput = window.document.getElementById("playerNameInput") as HTMLInputElement;
playerNameInput.placeholder = ui("menu.playerName.placeholder");
if (playerNameInput.value === "UnknownPlayer") playerNameInput.value = ui("menu.playerName.default");
(window.document.getElementById("linkImprint") as HTMLElement).textContent = ui("menu.imprint");
(window.document.getElementById("linkPrivacy") as HTMLElement).textContent = ui("menu.privacy");
registerClickListener("langRus", () => { applyLanguage("rus"); window.location.reload(); });
registerClickListener("langEng", () => { applyLanguage("eng"); window.location.reload(); });

registerClickListener("linkImprint", () => showPanel(ui("menu.imprint")));
registerClickListener("linkPrivacy", () => showPanel(ui("menu.privacy")));

loadValidatedInput("playerNameInput", "playerNameInputValidation")
	.onInput((_value, valid) => {
		//btnStartMultiplayer.disabled = !valid;
		btnStartSingleplayer.disabled = !valid;
	})
	.mutate(value => value.trim())
	.addRule(ui("validation.name.invalid"), value => playerNameValidationExp.test(value))
	.addRule(ui("validation.name.short"), value => value.length >= 3)
	.addRule(ui("validation.name.long"), value => value.length <= 32)
	.linkSetting(getSettingObject("player-name"), false);