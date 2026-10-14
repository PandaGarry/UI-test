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
import {t} from "../../util/Lang";
import {buildButton, buildTextNode} from "../type/TextNode";

//@module ui

loadStaticElement("GameHud");

registerClickListener("openSettings", () => showUIElement("SettingsPanel"));
registerClickListener("exitGame", () => window.location.reload());

const gameClock: HTMLElement = (window.document.getElementById("gameClock") as HTMLElement);
gameTicker.registry.register(() => gameClock.innerHTML = formatTime(gameTicker.getElapsedTime()));
registerSettingListener("hud-clock", show => gameClock.style.display = show ? "inherit" : "none");

interactionManager.draggable.add(resolveElement("GameHudContainer"));

const slider: HTMLElement = resolveElement("sliderAttackStrength");
interactionManager.draggable.add(slider);
const updateValue = (x: number) => setSliderValue((x - slider.getBoundingClientRect().left) / slider.getBoundingClientRect().width);

registerClickListener(slider, updateValue, true, true);
registerDragListener(slider, updateValue, updateValue, () => {});

const hiddenSlider: HTMLInputElement = resolveElement("sliderAttackHidden") as HTMLInputElement;
hiddenSlider.onchange = () => setSliderValue(parseInt(hiddenSlider.value) / 100);

const numberDisplay: HTMLElement = resolveElement("sliderAttackNumber");
let label = false;
function setSliderValue(value: number) {
	if (value < 0) value = 0;
	if (value > 1) value = 1;
	slider.style.setProperty("--value", value.toString());
	if (value > 0.2 && label) {
		numberDisplay.classList.add("selector-number-reversed");
		label = false;
	} else if (value < 0.2 && !label) {
		numberDisplay.classList.remove("selector-number-reversed");
		label = true;
	}
	hiddenSlider.value = (value * 100).toString();

	const scaled = Math.expm1(2 * Math.LN2 * value) / 3;
	numberDisplay.innerHTML = (scaled * 100).toFixed(1) + "%";
	mapActionHandler.setPower(scaled * 1000);
}

// Live leaderboard: top-5 by territory, plus the local player's rank.
// Refreshed a few times per second — GameStats keeps largestPlayers sorted.
const leaderboardElement = resolveElement("leaderboard");
gameTicker.registry.register(() => {
	if (gameTicker.getTickCount() % 10 !== 0) return;
	const total = playerManager.getPlayers().reduce((acc, p) => acc + p.getTerritorySize(), 0);
	if (total === 0) { leaderboardElement.innerHTML = ""; return; }
	const share = (size: number) => (size / total * 100).toFixed(1) + "%";
	const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c] as string));
	const row = (rank: number, name: string, size: number, color: string, highlight: boolean) =>
		`<div${highlight ? ' style="font-weight: bold;"' : ""}><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color};margin-right:5px;"></span>${rank}. ${escapeHtml(name)} — ${share(size)}</div>`;
	let html = largestPlayers.slice(0, 5).map((p, i) => row(i + 1, p.name, p.getTerritorySize(), p.baseColor.toString(), p === clientPlayer)).join("");
	const rank = largestPlayers.indexOf(clientPlayer);
	if (rank >= 5) html += row(rank + 1, clientPlayer.name, clientPlayer.getTerritorySize(), clientPlayer.baseColor.toString(), true);
	leaderboardElement.innerHTML = html;
});

const troopCountElement = resolveElement("selectorTroopCount");
const densityElement = resolveElement("selectorDensityNumber");
gameTicker.registry.register(() => {
	troopCountElement.innerText = formatTroops(clientPlayer.getTroops());
	densityElement.innerText = (clientPlayer.getTroops() / clientPlayer.getTerritorySize()).toFixed(2) + "%";
});

gameInitRegistry.register(() => {
	hideAllUIElements();
	showUIElement("GameHud");
	setSliderValue(0.5);
	troopCountElement.innerText = formatTroops(clientPlayer.getTroops());
	densityElement.innerText = (clientPlayer.getTroops() / clientPlayer.getTerritorySize()).toFixed(2) + "%";
});

blockInteraction(gameClock);
blockInteraction(resolveElement("selectorContainer"));

gameResultRegistry.register(result => {
	showPanel(t("game.result.title"),
		buildTextNode(result.getWinnerString()),
		buildButton(t("game.action.leave"), "danger", "btn-block").onClick(() => window.location.reload())
	);
})