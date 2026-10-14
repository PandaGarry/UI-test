import {gameTicker} from "../../game/GameTicker";
import {formatTime, formatTroops} from "../../util/StringFormatter";
import {registerSettingListener} from "../../util/settings/UserSettingManager";
import {blockInteraction, registerClickListener, registerDragListener} from "../UIEventResolver";
import {hideAllUIElements, loadStaticElement, showUIElement} from "../UIManager";
import {interactionManager} from "../../event/InteractionManager";
import {resolveElement} from "../UIElement";
import {mapActionHandler} from "../../game/action/MapActionHandler";
import {gameResultRegistry, gameInitRegistry} from "../../game/Game";
import {clientPlayer, playerManager} from "../../game/player/PlayerManager";
import {largestPlayers} from "../../game/GameStats";
import {showPanel} from "../type/UIPanel";
import {t, tUnsafe} from "../../util/Lang";
import {buildButton, buildTextNode} from "../type/TextNode";
import {registerKeybindAction} from "../../util/keybinds/Keybinds";

//@module ui

loadStaticElement("GameHud");

registerClickListener("openSettings", () => showUIElement("SettingsPanel"));
registerClickListener("exitGame", () => window.location.reload());

// Clock: shown or hidden by the "hud-clock" setting.
const gameClock = resolveElement("gameClock");
gameTicker.registry.register(() => gameClock.innerHTML = formatTime(gameTicker.getElapsedTime()));
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
let attackRatio = 0.5;
function setSliderValue(value: number) {
	if (value < 0) value = 0;
	if (value > 1) value = 1;
	attackRatio = value;
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
const stepDown = resolveElement("attackStepDown");
const stepUp = resolveElement("attackStepUp");
stepDown.textContent = "\u2212";
stepUp.textContent = "+";
stepDown.title = tUnsafe("hud.attack.decrease");
stepUp.title = tUnsafe("hud.attack.increase");
registerClickListener("attackStepDown", () => stepAttackRatio(-ATTACK_STEP));
registerClickListener("attackStepUp", () => stepAttackRatio(ATTACK_STEP));

// Keys act only while the HUD is on screen, so they do nothing in the menu.
const hudIsVisible = () => resolveElement("GameHudContainer").checkVisibility();
registerKeybindAction("attackRatioDown", () => { if (hudIsVisible()) stepAttackRatio(-ATTACK_STEP); });
registerKeybindAction("attackRatioUp", () => { if (hudIsVisible()) stepAttackRatio(ATTACK_STEP); });

// Leaderboard: a single summary line (rank and share) on phones, the full top-5 list on wide screens.
// The list is shown on tap on phones. Refreshed every 10 ticks, GameStats keeps largestPlayers sorted.
const leaderboardElement = resolveElement("leaderboard");
const leaderboardContainer = resolveElement("hudLeaderboard");
const leaderboardToggle = resolveElement("hudLeaderboardToggle");
const rankElement = resolveElement("hudRank");
const shareElement = resolveElement("hudShare");

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
	if (gameTicker.getTickCount() % 10 !== 0) return;
	const total = playerManager.getPlayers().reduce((acc, p) => acc + p.getTerritorySize(), 0);

	const rank = largestPlayers.indexOf(clientPlayer);
	rankElement.textContent = rank >= 0 ? `${rank + 1}` : "–";
	shareElement.textContent = formatShare(clientPlayer.getTerritorySize(), total);

	if (total === 0) { leaderboardElement.innerHTML = ""; return; }
	let html = largestPlayers.slice(0, 5)
		.map((p, i) => leaderboardRow(i + 1, p.name, formatShare(p.getTerritorySize(), total), p.baseColor.toString(), p === clientPlayer))
		.join("");
	if (rank >= 5) html += leaderboardRow(rank + 1, clientPlayer.name, formatShare(clientPlayer.getTerritorySize(), total), clientPlayer.baseColor.toString(), true);
	leaderboardElement.innerHTML = html;
});

const troopCountElement = resolveElement("selectorTroopCount");
const densityElement = resolveElement("selectorDensityNumber");
// Troops per owned tile. A player without territory (dead, or not spawned yet) has no density.
const formatDensity = (): string => {
	const territory = clientPlayer.getTerritorySize();
	return territory > 0 ? (clientPlayer.getTroops() / territory).toFixed(2) : "0.00";
};
gameTicker.registry.register(() => {
	troopCountElement.innerText = formatTroops(clientPlayer.getTroops());
	densityElement.innerText = formatDensity();
});

gameInitRegistry.register(() => {
	hideAllUIElements();
	showUIElement("GameHud");
	setSliderValue(0.5);
	troopCountElement.innerText = formatTroops(clientPlayer.getTroops());
	densityElement.innerText = formatDensity();
});

blockInteraction(gameClock);
blockInteraction(resolveElement("selectorContainer"));

gameResultRegistry.register(result => {
	showPanel(t("game.result.title"),
		buildTextNode(result.getWinnerString()),
		buildButton(t("game.action.leave"), "danger", "btn-block").onClick(() => window.location.reload())
	);
});
