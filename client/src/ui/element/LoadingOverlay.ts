import {loadStaticElement} from "../UIManager";
import {ui} from "../../platform/Lang";
import {gameViewReadyRegistry} from "@frontline/core/game/Game";
import {gameFirstFrameRegistry} from "../../renderer/GameRenderer";
import {gameLoadFailRegistry} from "../../loader/GameLoader";

// TEMPORARY loading window (see static/LoadingOverlay.html). Timeline of a local game:
//   5 s cancel window (BalanceConfig.lobbyStartDelaySeconds) -> this window -> map visible -> 10 s spawn selection.
// The window opens when the cancel window ends, stays at least MIN_SHOW_MS, and closes only after the first gameplay
// frame is drawn. Only then gameViewReadyRegistry fires, which starts the spawn-selection timer (SPAWN_PHASE_MS).
loadStaticElement("LoadingOverlay");

const FADE_MS = 250;
/**
 * TEMPORARY: minimum time the window stays on screen (owner request: 1-2 s), so the transition is readable even when
 * the map was already preloaded during the cancel window.
 */
const MIN_SHOW_MS = 1500;
let shownAt = 0;

export function showLoadingOverlay(mapName: string): void {
	const title = document.getElementById("loadingTitle");
	const hint = document.getElementById("loadingHint");
	const name = document.getElementById("loadingMapName");
	if (title) title.textContent = ui("loading.title");
	if (hint) hint.textContent = ui("loading.hint");
	if (name) name.textContent = mapName;
	// Shown directly, not via showUIElement: GameHud calls hideAllUIElements() on game init, which would close it at once.
	const wrapper = document.getElementById("LoadingOverlay");
	if (wrapper) wrapper.style.display = "";
	const container = document.getElementById("LoadingOverlayContainer");
	if (container) container.style.opacity = "1";
	shownAt = performance.now();
}

function hideWrapper(): void {
	const wrapper = document.getElementById("LoadingOverlay");
	if (wrapper) wrapper.style.display = "none";
}

function hideAndNotifyReady(): void {
	const container = document.getElementById("LoadingOverlayContainer");
	if (!container) {
		hideWrapper();
		gameViewReadyRegistry.broadcast();
		return;
	}
	const remaining = Math.max(0, MIN_SHOW_MS - (performance.now() - shownAt));
	window.setTimeout(() => {
		container.style.transition = `opacity ${FADE_MS}ms`;
		container.style.opacity = "0";
	}, remaining);
	window.setTimeout(() => {
		hideWrapper();
		container.style.transition = "";
		container.style.opacity = "1";
		gameViewReadyRegistry.broadcast();
	}, remaining + FADE_MS);
}

gameFirstFrameRegistry.register(hideAndNotifyReady);
gameLoadFailRegistry.register(hideWrapper);
