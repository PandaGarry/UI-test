import {gameTicker} from "../../game/GameTicker";
import {formatTroopsCompact} from "../../util/StringFormatter";
import {attackActionHandler} from "../../game/attack/AttackActionHandler";
import type {AttackExecutor} from "../../game/attack/AttackExecutor";
import {registerSettingListener} from "../../util/settings/UserSettingManager";
import {blockInteraction, registerClickListener, registerDragListener} from "../UIEventResolver";
import {hideAllUIElements, loadStaticElement, showUIElement} from "../UIManager";
import {interactionManager} from "../../event/InteractionManager";
import {resolveElement} from "../UIElement";
import {ATTACK_SENT_EVENT, mapActionHandler} from "../../game/action/MapActionHandler";
import {gameResultRegistry, gameInitRegistry, pauseGame, resumeGame} from "../../game/Game";
import {clientPlayer, playerManager} from "../../game/player/PlayerManager";
import {BalanceConfig} from "../../game/BalanceConfig";
import {largestPlayers} from "../../game/GameStats";
import {showPanel} from "../type/UIPanel";
import {t, tUnsafe} from "../../util/Lang";
import {buildButton, buildTextNode} from "../type/TextNode";
import {registerKeybindAction} from "../../util/keybinds/Keybinds";
import {submitGameAction} from "../../network/NetworkManager";
import {AttackActionPacket} from "../../network/protocol/packet/game/AttackActionPacket";
import "./RadialMenu";
import {getInspectedOwner, onInspectedOwnerChange} from "../../game/InspectedTarget";
import {territoryManager} from "../../game/TerritoryManager";

//@module ui

loadStaticElement("GameHud");

registerClickListener("openSettings", () => showUIElement("GameMenu"));

// Pause and exit sit next to the clock and settings (docs/TERRON-UI-MAP-2026-10-15.md, top bar).
// Pause toggles the ticker; exit asks first and then returns to the menu.
const pauseButton = resolveElement("hudPause");
let paused = false;
registerClickListener("hudPause", () => {
	paused = !paused;
	if (paused) pauseGame(); else resumeGame();
	pauseButton.setAttribute("aria-pressed", String(paused));
	pauseButton.classList.toggle("is-active", paused);
});
registerClickListener("hudExit", () => {
	showPanel(t("game.action.leave"),
		buildTextNode(tUnsafe("help_modal.exit_confirmation")),
		buildButton(t("game.action.leave"), "danger", "btn-block").onClick(() => window.location.reload())
	);
});

// Clock: shown or hidden by the "hud-clock" setting.
const gameClock = resolveElement("gameClock");
// Clock as in the reference: mm:ss (no hundredths). Elapsed time comes in ms.
const formatClock = (ms: number) => {
	const total = Math.floor(ms / 1000);
	return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
gameTicker.registry.register(() => gameClock.innerHTML = formatClock(gameTicker.getElapsedTime()));
registerSettingListener("hud-clock", show => gameClock.style.display = show ? "inherit" : "none");

// Dragging the HUD background pans the map (after a 1 s hold, see InteractionManager).
interactionManager.draggable.add(resolveElement("GameHudContainer"));

// Attack strength slider: 0..1 on screen, mapped to attack power through an exponential curve.
const slider = resolveElement("sliderAttackStrength");
interactionManager.draggable.add(slider);
const updateValue = (x: number) => setSliderValue((x - slider.getBoundingClientRect().left) / slider.getBoundingClientRect().width);

registerClickListener(slider, updateValue, true, true);
registerDragListener(slider, updateValue, updateValue, () => {});

const hiddenSlider = resolveElement("sliderAttackHidden") as HTMLInputElement;
hiddenSlider.onchange = () => setSliderValue(parseInt(hiddenSlider.value) / 100);

const sliderValueLabel = resolveElement("sliderAttackNumber");
let labelOnLeft = false;
// The attack strength is a user setting: it is kept between games (and between lobbies).
const ATTACK_RATIO_KEY = "attackRatio";
const DEFAULT_ATTACK_POWER = 0.2;
const powerToRatio = (power: number) => Math.log(1 + 3 * power) / (2 * Math.LN2);
const savedAttackRatio = Number(localStorage.getItem(ATTACK_RATIO_KEY));
let attackRatio = Number.isFinite(savedAttackRatio) && localStorage.getItem(ATTACK_RATIO_KEY) !== null ? savedAttackRatio : powerToRatio(DEFAULT_ATTACK_POWER);
function setSliderValue(value: number) {
	if (value < 0) value = 0;
	if (value > 1) value = 1;
	attackRatio = value;
	localStorage.setItem(ATTACK_RATIO_KEY, value.toString());
	slider.style.setProperty("--value", value.toString());
	// Keep the label clear of the thumb: on the right at low values, on the left at high values.
	labelOnLeft = value > 0.2;
	sliderValueLabel.classList.toggle("hud-slider-value-left", labelOnLeft);
	hiddenSlider.value = (value * 100).toString();

	const scaled = Math.expm1(2 * Math.LN2 * value) / 3;
	sliderValueLabel.innerHTML = (scaled * 100).toFixed(1) + "%";
	mapActionHandler.setPower(scaled * 1000);
}

// Step buttons move the attack ratio by a fixed amount. The rounding keeps repeated steps exact.
const ATTACK_STEP = 0.05;
const stepAttackRatio = (delta: number) => setSliderValue(Math.round((attackRatio + delta) * 100) / 100);
// The visible -/+ buttons were replaced by the slider (Terron-like bottom panel); keys still step the ratio.

// Keys act only while the HUD is on screen, so they do nothing in the menu.
const hudIsVisible = () => resolveElement("GameHudContainer").checkVisibility();
registerKeybindAction("attackRatioDown", () => { if (hudIsVisible()) stepAttackRatio(-ATTACK_STEP); });
registerKeybindAction("attackRatioUp", () => { if (hudIsVisible()) stepAttackRatio(ATTACK_STEP); });

// Leaderboard: a single summary line (rank and share) on phones, the full top-5 list on wide screens.
// The list is shown on tap on phones. Refreshed every 10 ticks, GameStats keeps largestPlayers sorted.
const leaderboardElement = resolveElement("leaderboard");
const leaderboardContainer = resolveElement("hudLeaderboard");
const leaderboardToggle = resolveElement("hudLeaderboardToggle");
const playerNameElement = resolveElement("hudPlayerName");
const playerSwatchElement = resolveElement("hudPlayerSwatch");

// The top block shows the owner of the last tapped tile (own name when nothing was tapped).
// Neutral land is "Пустошь" (reference doc, section 4).
const playerBlockElement = resolveElement("hudPlayerBlock");
const showTarget = (owner: number) => {
	// The block appears once the player has territory or a tap has chosen a target (reference: IMG_5796 is empty).
	playerBlockElement.hidden = !(clientPlayer.getTerritorySize() > 0 || owner >= 0);
	if (owner === territoryManager.OWNER_NONE) {
		playerNameElement.textContent = "Пустошь";
		playerSwatchElement.style.background = "#8a8f98";
		return;
	}
	const player = owner >= 0 && playerManager.validatePlayer(owner) ? playerManager.getPlayer(owner) : clientPlayer;
	playerNameElement.textContent = player.name;
	playerSwatchElement.style.background = player.baseColor.toString();
};
onInspectedOwnerChange(showTarget);
gameTicker.registry.register(() => {
	if (gameTicker.getTickCount() % BalanceConfig.ticksPerSecond === 0) showTarget(getInspectedOwner());
});

registerClickListener("hudLeaderboardToggle", () => {
	const open = !leaderboardContainer.classList.contains("open");
	leaderboardContainer.classList.toggle("open", open);
	leaderboardToggle.setAttribute("aria-expanded", String(open));
});

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c] as string));
const formatShare = (size: number, total: number) => total > 0 ? (size / total * 100).toFixed(1) + "%" : "0.0%";
const leaderboardRow = (rank: number, name: string, share: string, color: string, isSelf: boolean) =>
	`<div class="hud-leaderboard-row${isSelf ? " is-self" : ""}"><span class="hud-leaderboard-swatch" style="background:${color};"></span><span class="hud-leaderboard-name">${rank}. ${escapeHtml(name)}</span><span class="hud-leaderboard-share">${share}</span></div>`;

gameTicker.registry.register(() => {
	if (gameTicker.getTickCount() % BalanceConfig.ticksPerSecond !== 0) return;
	const total = playerManager.getPlayers().reduce((acc, p) => acc + p.getTerritorySize(), 0);

	const rank = largestPlayers.indexOf(clientPlayer);

	if (total === 0) { leaderboardElement.innerHTML = ""; return; }
	let html = largestPlayers.slice(0, 5)
		.map((p, i) => leaderboardRow(i + 1, p.name, formatShare(p.getTerritorySize(), total), p.baseColor.toString(), p === clientPlayer))
		.join("");
	if (rank >= 5) html += leaderboardRow(rank + 1, clientPlayer.name, formatShare(clientPlayer.getTerritorySize(), total), clientPlayer.baseColor.toString(), true);
	leaderboardElement.innerHTML = html;
});

// Bottom action row and attack list (docs/REFERENCE-UI-2026-10-15.md, sections 3-4).
// Attacks toggles the list above the row. Chat and the other locked buttons do nothing yet.
const attackListElement = resolveElement("hudAttackList");
const attacksButton = resolveElement("hudBtnAttacks");
const SWORD_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M20 4L12 12M8.5 8.5L15.5 15.5M12 12L4 20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`;
let attackListOpen = false;
const setAttackList = (open: boolean) => {
	attackListOpen = open;
	attackListElement.hidden = !open;
	attacksButton.setAttribute("aria-expanded", String(open));
	attacksButton.classList.toggle("is-active", open);
};
registerClickListener("hudBtnAttacks", () => setAttackList(!attackListOpen));
// A sent attack opens the list at once, so the player sees it start (the list stays open until closed).
window.addEventListener(ATTACK_SENT_EVENT, () => setAttackList(true));
// Chat is locked until the chat panel exists (no tap handler yet).

// Rows: outgoing attacks in blue with the sent troops, incoming in red with the attacking troops.
// Neutral land is named "Пустошь" (reference doc, section 4).
// Outgoing rows end with a cross that calls the attack back (troops return to the attacker).
const attackRow = (dir: "out" | "in", troops: number, name: string, index: number) =>
	`<div class="hud-attack-item hud-attack-item-${dir}"><span class="hud-attack-item-troops">${dir === "out" ? "↑" : "↓"} ${formatTroopsCompact(troops)}</span><span class="hud-attack-item-name">${escapeHtml(name)}</span>${dir === "out" ? `<button class="hud-attack-cancel" data-attack="${index}" title="Отменить атаку" aria-label="Отменить атаку">×</button>` : `<button class="hud-attack-reply" data-reply="${index}" title="Атаковать в ответ" aria-label="Атаковать в ответ">${SWORD_ICON}</button>`}</div>`;
let shownOutgoing: AttackExecutor[] = [];
let shownIncoming: AttackExecutor[] = [];
const renderAttackList = () => {
	if (!attackListOpen) return;
	shownOutgoing = attackActionHandler.outgoingAttacks(clientPlayer.id).slice(0, 4);
	shownIncoming = attackActionHandler.incomingAttacks(clientPlayer.id).slice(0, 4);
	const rows = [
		...shownOutgoing.map((a, i) => attackRow("out", a.getTroops(), a.target ? a.target.name : "Пустошь", i)),
		...shownIncoming.map((a, i) => attackRow("in", a.getTroops(), a.player.name, i)),
	];
	attackListElement.innerHTML = rows.length ? rows.join("") : `<div class="hud-attack-empty">Атак нет</div>`;
};
gameTicker.registry.register(renderAttackList);
attackListElement.addEventListener("click", e => {
	const target = e.target as HTMLElement;
	const reply = target.closest(".hud-attack-reply") as HTMLElement | null;
	if (reply) {
		// Counter-attack: same strength as the slider, against the player that attacks us.
		const incoming = shownIncoming[Number(reply.dataset["reply"])];
		if (incoming) submitGameAction(new AttackActionPacket(clientPlayer.id, incoming.player.id, Math.expm1(2 * Math.LN2 * attackRatio) / 3 * 1000));
		renderAttackList();
		return;
	}
	const button = target.closest(".hud-attack-cancel") as HTMLElement | null;
	if (!button) return;
	const attack = shownOutgoing[Number(button.dataset["attack"])];
	if (attack) attackActionHandler.retreat(attack);
	renderAttackList();
});

// Bottom panel: troops, their growth per second, and the attack share. Outgoing and incoming
// armies are shown in the attack list, not here (docs/QA-FEEDBACK-2026-10-15-R3.md, item 4).
const troopCountElement = resolveElement("selectorTroopCount");
const troopRateElement = resolveElement("hudTroopRate");
let troopsAtLastSecond = 0;
const sendCountElement = resolveElement("hudSendCount");
const troopFillElement = resolveElement("hudTroopFill");
const updateTroopDisplay = () => {
	const troops = clientPlayer.getTroops();
	const cap = clientPlayer.troopCap();
	// Left: troops in reserve. Right: the limit (troop cap). The bar shows reserve as a share of the limit.
	sendCountElement.innerText = formatTroopsCompact(troops);
	troopCountElement.innerText = formatTroopsCompact(cap);
	troopFillElement.style.width = (cap > 0 ? Math.min(1, troops / cap) * 100 : 0).toFixed(1) + "%";
	if (gameTicker.getTickCount() % BalanceConfig.ticksPerSecond === 0) {
		const rate = Math.max(0, troops - troopsAtLastSecond);
		troopRateElement.innerText = "+" + formatTroopsCompact(rate) + "/s";
		troopsAtLastSecond = troops;
	}
};
gameTicker.registry.register(updateTroopDisplay);

gameInitRegistry.register(() => {
	hideAllUIElements();
	showUIElement("GameHud");
	setSliderValue(attackRatio);
	troopsAtLastSecond = clientPlayer.getTroops();
	updateTroopDisplay();
});

blockInteraction(gameClock);
blockInteraction(resolveElement("selectorContainer"));
// Locked action buttons only show the lock badge; they never react to taps.

gameResultRegistry.register(result => {
	showPanel(t("game.result.title"),
		buildTextNode(result.getWinnerString()),
		buildButton(t("game.action.leave"), "danger", "btn-block").onClick(() => window.location.reload())
	);
});
