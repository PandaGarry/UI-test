import {getDefaultMapIds} from "../../map/MapRegistry";
import {getSettingObject} from "../../util/settings/UserSettingManager";
import {registerClickListener} from "../UIEventResolver";
import {loadValidatedInput} from "../type/ValidatedInput";
import {showPanel} from "../type/UIPanel";
import {hideAllUIElements, loadStaticElement, showUIElement} from "../UIManager";
import {t, ui, applyLanguage, detectLanguage} from "../../util/Lang";
import {displayAlert} from "../type/TextNode";
import {gameLoadFailRegistry} from "../../game/GameLoader";
import {openLobbyCreate} from "./LobbyCreate";


loadStaticElement("MainMenu")

const btnStartSingleplayer: HTMLButtonElement = (window.document.getElementById("btnStartSingleplayer") as HTMLButtonElement);
const playerNameInput = window.document.getElementById("playerNameInput") as HTMLInputElement;
const menuDrawer = window.document.getElementById("menuDrawer") as HTMLElement;
const menuDrawerBackdrop = window.document.getElementById("menuDrawerBackdrop") as HTMLElement;
const menuBurger = window.document.getElementById("menuBurger") as HTMLButtonElement;

const playerNameValidationExp: RegExp = /^[a-zA-Z0-9\u00A0-\u00FF\u0100-\u024F\u0400-\u04FF\u1E00-\u1EFF\-_. ({)}<>]*$/;

gameLoadFailRegistry.register(() => {
	hideAllUIElements();
	showUIElement("MainMenu");
	displayAlert("danger", t("game.load.fail"), "slow");
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
registerClickListener("btnStartSingleplayer", openLobbyCreate);
registerClickListener("drawerCreate", () => { setDrawerOpen(false); openLobbyCreate(); });
registerClickListener("drawerImprint", () => { setDrawerOpen(false); showPanel(ui("menu.imprint")); });
registerClickListener("drawerPrivacy", () => { setDrawerOpen(false); showPanel(ui("menu.privacy")); });

// --- News banner ---
// A short item stays in the band. A long item (the band cuts its title or text) opens a small dialog with the full text.
// Items rotate every 6 s; rotation pauses on hover and while the dialog is open. × hides the banner for this visit.

const NEWS_ROTATE_MS = 6000;
const newsItems = [1, 2, 3];
let newsIndex = 0;
let newsTimer: number | undefined;
let newsHovered = false;
let newsDialogOpen = false;
const newsBanner = window.document.getElementById("newsBanner") as HTMLElement;
const newsBody = window.document.getElementById("newsBody") as HTMLButtonElement;
const newsTitle = window.document.getElementById("newsTitle") as HTMLElement;
const newsText = window.document.getElementById("newsText") as HTMLElement;
const newsTag = window.document.getElementById("newsTag") as HTMLElement;
const newsCounter = window.document.getElementById("newsCounter") as HTMLElement;
const newsDialog = window.document.getElementById("newsDialog") as HTMLElement;
const newsDialogTag = window.document.getElementById("newsDialogTag") as HTMLElement;
const newsDialogTitle = window.document.getElementById("newsDialogTitle") as HTMLElement;
const newsDialogText = window.document.getElementById("newsDialogText") as HTMLElement;
const newsDialogClose = window.document.getElementById("newsDialogClose") as HTMLButtonElement;

/** Width the element needs on one line. Measured on an invisible copy, because the live element stretches to the band. */
function newsNaturalWidth(element: HTMLElement): number {
	const probe = element.cloneNode(true) as HTMLElement;
	probe.removeAttribute("id");
	probe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;width:auto;max-width:none;overflow:visible;text-overflow:clip;";
	newsBody.append(probe);
	const width = probe.getBoundingClientRect().width;
	probe.remove();
	return width;
}

/** True when the band cuts the title or text. Hidden bands measure 0, so this is checked again when the band is shown. */
function newsIsTruncated(): boolean {
	const available = newsBody.clientWidth;
	return newsNaturalWidth(newsTitle) > available + 1 || newsNaturalWidth(newsText) > available + 1;
}

/** Long items are clickable and announce the dialog; short items are plain text. */
function updateNewsAffordance() {
	const long = newsIsTruncated();
	newsBody.classList.toggle("is-long", long);
	newsBody.disabled = !long;
	if (long) newsBody.setAttribute("aria-haspopup", "dialog");
	else newsBody.removeAttribute("aria-haspopup");
}

function renderNews() {
	const n = newsItems[newsIndex];
	newsTitle.textContent = ui(`menu.news.title.${n}` as "menu.news.title.1");
	newsText.textContent = ui(`menu.news.text.${n}` as "menu.news.text.1");
	newsTag.textContent = ui("menu.news.label");
	newsCounter.replaceChildren(...newsItems.map((_, i) => {
		const dot = document.createElement("button");
		dot.type = "button";
		dot.className = i === newsIndex ? "menu-news-dot is-active" : "menu-news-dot";
		dot.setAttribute("aria-label", `${i + 1} / ${newsItems.length}`);
		dot.addEventListener("click", () => showNews(i));
		return dot;
	}));
	updateNewsAffordance();
}

function openNewsDialog() {
	if (newsDialogOpen || !newsIsTruncated()) return;
	newsDialogTag.textContent = ui("menu.news.label");
	newsDialogTitle.textContent = newsTitle.textContent;
	newsDialogText.textContent = newsText.textContent;
	newsDialog.hidden = false;
	newsDialogOpen = true;
	newsBody.setAttribute("aria-expanded", "true");
	newsDialogClose.focus();
}

function closeNewsDialog() {
	if (!newsDialogOpen) return;
	newsDialog.hidden = true;
	newsDialogOpen = false;
	newsBody.setAttribute("aria-expanded", "false");
	newsBody.focus();
}

function showNews(index: number) {
	newsIndex = index;
	renderNews();
	startNewsTimer();
}

function startNewsTimer() {
	if (newsTimer !== undefined) window.clearInterval(newsTimer);
	newsTimer = window.setInterval(() => {
		if (newsHovered || newsDialogOpen || !newsBanner.isConnected) return;
		showNews((newsIndex + 1) % newsItems.length);
	}, NEWS_ROTATE_MS);
}

renderNews();
startNewsTimer();
// The band is hidden until the menu opens; re-check the affordance whenever it gets a size.
new ResizeObserver(() => updateNewsAffordance()).observe(newsBody);
newsBody.addEventListener("click", openNewsDialog);
newsDialogClose.addEventListener("click", closeNewsDialog);
newsDialog.addEventListener("click", event => { if (event.target === newsDialog) closeNewsDialog(); });
newsBanner.addEventListener("mouseenter", () => { newsHovered = true; });
newsBanner.addEventListener("mouseleave", () => { newsHovered = false; });
registerClickListener("newsClose", () => {
	if (newsTimer !== undefined) window.clearInterval(newsTimer);
	newsBanner.remove();
});

// --- Localize static texts and wire the RU/EN switcher (reload applies it everywhere) ---

(window.document.getElementById("btnCreateText") as HTMLElement).textContent = ui("menu.create");
(window.document.getElementById("btnJoinLobbyLock") as HTMLElement).title = ui("menu.locked");
(window.document.getElementById("btnJoinLobby") as HTMLElement).title = ui("menu.locked");
(window.document.getElementById("drawerLobbiesText") as HTMLElement).textContent = ui("menu.drawer.lobbies");
(window.document.getElementById("drawerSettingsText") as HTMLElement).textContent = ui("menu.drawer.settings");
(window.document.getElementById("linkCommunity") as HTMLElement).textContent = ui("menu.drawer.community");
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

// Mode tabs, map card, account: labels only. Teams and account are locked (no backend yet).
(window.document.getElementById("modeFfa") as HTMLElement).textContent = ui("menu.mode.ffa");
(window.document.getElementById("modeTeamsText") as HTMLElement).textContent = ui("menu.mode.teams");
(window.document.getElementById("btnAccount") as HTMLElement).setAttribute("aria-label", ui("menu.account"));
(window.document.getElementById("btnAccount") as HTMLElement).title = ui("menu.account") + ": " + ui("menu.soon");
(window.document.getElementById("btnMapJoinText") as HTMLElement).textContent = ui("menu.map.join");
(window.document.getElementById("btnMapJoin") as HTMLElement).title = ui("menu.map.joinTitle") + " — " + ui("menu.soon");
(window.document.getElementById("skinLabel") as HTMLElement).textContent = ui("menu.skin");
(window.document.getElementById("mapMeta") as HTMLElement).textContent = "0/10 " + ui("menu.map.players");
const defaultMap = getDefaultMapIds().find(([id]) => id.toLowerCase().includes("world"));
if (defaultMap) (window.document.getElementById("mapName") as HTMLElement).textContent = defaultMap[1].name;

// Avatar in the player bar shows the initials of up to two words of the name.
const menuAvatar = window.document.getElementById("menuAvatar") as HTMLElement;
function updateAvatar(name: string) {
	const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join("");
	menuAvatar.textContent = (initials || "?").toUpperCase();
}

loadValidatedInput("playerNameInput", "playerNameInputValidation")
	.onInput((value, valid) => {
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

// Enter confirms the name (blur commits the value and validation).
playerNameInput.addEventListener("keydown", event => {
	if (event.key === "Enter") playerNameInput.blur();
});

window.addEventListener("keydown", event => {
	if (event.key !== "Escape") return;
	if (newsDialogOpen) closeNewsDialog();
	else if (menuDrawer.classList.contains("open")) setDrawerOpen(false);
});
