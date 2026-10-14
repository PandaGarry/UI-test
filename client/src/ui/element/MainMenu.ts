import {getDefaultMapIds} from "../../map/MapRegistry";
import {getSetting, getSettingObject} from "../../util/settings/UserSettingManager";
import {GameModeIds} from "../../network/protocol/util/GameTypeIds";
import {registerClickListener} from "../UIEventResolver";
import {loadValidatedInput} from "../type/ValidatedInput";
import {showPanel} from "../type/UIPanel";
import {hideAllUIElements, loadStaticElement, showUIElement} from "../UIManager";
import {t, ui, applyLanguage, detectLanguage} from "../../util/Lang";
import {buildButton, displayAlert} from "../type/TextNode";
import {buildContainer} from "../type/ContentField";
import {gameLoadFailRegistry, tryStartGame} from "../../game/GameLoader";
import {BalanceConfig} from "../../game/BalanceConfig";
//import {openMultiplayerLobby} from "./MultiplayerLobby";

//@module ui

loadStaticElement("MainMenu")

//const btnStartMultiplayer: HTMLButtonElement = (window.document.getElementById("btnStartMultiplayer") as HTMLButtonElement);
const btnStartSingleplayer: HTMLButtonElement = (window.document.getElementById("btnStartSingleplayer") as HTMLButtonElement);
const playerNameInput = window.document.getElementById("playerNameInput") as HTMLInputElement;
const menuDrawer = window.document.getElementById("menuDrawer") as HTMLElement;
const menuDrawerBackdrop = window.document.getElementById("menuDrawerBackdrop") as HTMLElement;
const menuBurger = window.document.getElementById("menuBurger") as HTMLButtonElement;

const playerNameValidationExp: RegExp = /^[a-zA-Z0-9\u00A0-\u00FF\u0100-\u024F\u0400-\u04FF\u1E00-\u1EFF\-_. ({)}<>]*$/;

//registerClickListener("btnStartMultiplayer", () => openMultiplayerLobby());

/** Stored name, or the localized default when the placeholder is still stored. */
function getPlayerName(): string {
	const name = getSetting("player-name");
	return name === "UnknownPlayer" ? ui("menu.playerName.default") : name;
}

/** Start a singleplayer match: bot count, game speed, then map. Same start path as a lobby with bots. */
function startSingleplayerFlow() {
	const showMapSelect = (botCount: number, speed: number) => showPanel(t("menu.map.select"), buildContainer("grid", "grid-3col").setContent(...getDefaultMapIds().map(map =>
		buildButton(map[1].name).onClick(() => tryStartGame(map[0], GameModeIds.FFA, 23452345, [{name: getPlayerName()}], 0, true, botCount + 1, speed)))
	));
	const showSpeedSelect = (botCount: number) => showPanel(t("menu.speed.select"), buildContainer("grid", "grid-3col").setContent(...BalanceConfig.gameSpeedOptions.map(speed =>
		buildButton(`${speed}×`).onClick(() => showMapSelect(botCount, speed)))
	));
	showPanel(t("menu.bots.select"), buildContainer("grid", "grid-3col").setContent(...BalanceConfig.botCountOptions.map(count =>
		buildButton(String(count)).onClick(() => showSpeedSelect(count)))
	));
}

registerClickListener("btnStartSingleplayer", startSingleplayerFlow);

gameLoadFailRegistry.register(() => {
	hideAllUIElements();
	showUIElement("MainMenu");
	displayAlert("danger", t("game.load.fail"), "slow")
});

// --- Side menu (burger) ---

function setDrawerOpen(open: boolean) {
	menuDrawer.classList.toggle("open", open);
	menuDrawerBackdrop.classList.toggle("open", open);
	menuDrawer.setAttribute("aria-hidden", String(!open));
	menuDrawerBackdrop.setAttribute("aria-hidden", String(!open));
	menuBurger.setAttribute("aria-expanded", String(open));
}

menuBurger.addEventListener("click", () => setDrawerOpen(!menuDrawer.classList.contains("open")));
menuDrawerBackdrop.addEventListener("click", () => setDrawerOpen(false));
registerClickListener("menuDrawerClose", () => setDrawerOpen(false));
registerClickListener("drawerPlay", () => setDrawerOpen(false));
registerClickListener("drawerCreate", () => { setDrawerOpen(false); startSingleplayerFlow(); });
registerClickListener("drawerImprint", () => { setDrawerOpen(false); showPanel(ui("menu.imprint")); });
registerClickListener("drawerPrivacy", () => { setDrawerOpen(false); showPanel(ui("menu.privacy")); });
window.addEventListener("keydown", event => {
	if (event.key === "Escape" && menuDrawer.classList.contains("open")) setDrawerOpen(false);
});

// --- News banner: one item at a time, click the text to cycle, × hides it for this visit ---

const newsItems = [1, 2];
let newsIndex = 0;
const newsBanner = window.document.getElementById("newsBanner") as HTMLElement;
const newsTitle = window.document.getElementById("newsTitle") as HTMLElement;
const newsText = window.document.getElementById("newsText") as HTMLElement;
const newsTag = window.document.getElementById("newsTag") as HTMLElement;

function renderNews() {
	const n = newsItems[newsIndex];
	newsTitle.textContent = ui(`menu.news.title.${n}` as "menu.news.title.1");
	newsText.textContent = ui(`menu.news.text.${n}` as "menu.news.text.1");
	newsTag.textContent = `${ui("menu.news.label")} ${newsIndex + 1}/${newsItems.length}`;
}

renderNews();
registerClickListener("newsClose", () => newsBanner.remove());
newsBanner.querySelector(".menu-news-body")?.addEventListener("click", () => {
	newsIndex = (newsIndex + 1) % newsItems.length;
	renderNews();
});

// --- Localize static texts and wire the RU/EN switcher (reload applies it everywhere) ---

btnStartSingleplayer.textContent = ui("menu.create");
(window.document.getElementById("btnJoinLobbyLock") as HTMLElement).title = ui("menu.locked");
(window.document.getElementById("btnJoinLobby") as HTMLElement).title = ui("menu.locked");
(window.document.getElementById("drawerLobbiesText") as HTMLElement).textContent = ui("menu.drawer.lobbies");
(window.document.getElementById("drawerSettingsText") as HTMLElement).textContent = ui("menu.drawer.settings");
(window.document.getElementById("linkCommunity") as HTMLElement).textContent = ui("menu.drawer.community");
(window.document.getElementById("linkSource") as HTMLElement).textContent = ui("menu.drawer.source");
(window.document.getElementById("btnJoinLobbyText") as HTMLElement).textContent = ui("menu.joinLobby");
(window.document.getElementById("menuNameLabel") as HTMLElement).textContent = ui("menu.player.label");
(window.document.getElementById("menuBurger") as HTMLElement).setAttribute("aria-label", ui("menu.menu"));
(window.document.getElementById("menuDrawerClose") as HTMLElement).setAttribute("aria-label", ui("menu.drawer.close"));
(window.document.getElementById("linkImprint") as HTMLElement).textContent = ui("menu.imprint");
(window.document.getElementById("linkPrivacy") as HTMLElement).textContent = ui("menu.privacy");
(window.document.getElementById("drawerImprint") as HTMLElement).textContent = ui("menu.imprint");
(window.document.getElementById("drawerPrivacy") as HTMLElement).textContent = ui("menu.privacy");
(window.document.getElementById("drawerPlay") as HTMLElement).textContent = ui("menu.drawer.home");
(window.document.getElementById("drawerCreate") as HTMLElement).textContent = ui("menu.create");
playerNameInput.placeholder = ui("menu.playerName.placeholder");

// Mark the active language in the top-bar switch (current choice comes from detectLanguage()).
const activeLang = detectLanguage();
(window.document.getElementById("langRus") as HTMLElement).setAttribute("aria-pressed", String(activeLang === "rus"));
(window.document.getElementById("langEng") as HTMLElement).setAttribute("aria-pressed", String(activeLang === "eng"));
registerClickListener("langRus", () => { applyLanguage("rus"); window.location.reload(); });
registerClickListener("langEng", () => { applyLanguage("eng"); window.location.reload(); });

registerClickListener("linkImprint", () => showPanel(ui("menu.imprint")));
registerClickListener("linkPrivacy", () => showPanel(ui("menu.privacy")));

// Avatar in the player bar shows the first letter of the name.
const menuAvatar = window.document.getElementById("menuAvatar") as HTMLElement;
function updateAvatar(name: string) {
	menuAvatar.textContent = (name.trim().charAt(0) || "?").toUpperCase();
}

loadValidatedInput("playerNameInput", "playerNameInputValidation")
	.onInput((value, valid) => {
		//btnStartMultiplayer.disabled = !valid;
		btnStartSingleplayer.disabled = !valid;
		updateAvatar(value);
	})
	.mutate(value => value.trim())
	.addRule(ui("validation.name.invalid"), value => playerNameValidationExp.test(value))
	.addRule(ui("validation.name.short"), value => value.length >= 3)
	.addRule(ui("validation.name.long"), value => value.length <= 32)
	.linkSetting(getSettingObject("player-name"), false);
// The stored placeholder is shown in the active language (linkSetting writes the raw value first).
if (playerNameInput.value === "UnknownPlayer") playerNameInput.value = ui("menu.playerName.default");
updateAvatar(playerNameInput.value);
