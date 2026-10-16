import {loadStaticElement} from "../UIManager";
import {ui} from "../../platform/Lang";
import {gameViewReadyRegistry} from "@frontline/core/game/Game";
import {gameFirstFrameRegistry} from "../../renderer/GameRenderer";
import {gameLoadFailRegistry} from "../../loader/GameLoader";

// TEMPORARY loading window (see static/LoadingOverlay.html). It covers the map while it loads, then closes on the
// first gameplay frame and only then tells the core that the map is visible (gameViewReadyRegistry), which starts the
// spawn-selection timer. The 5-second cancel window is a separate thing (BalanceConfig.lobbyStartDelaySeconds).
loadStaticElement("LoadingOverlay");

const FADE_MS = 250;

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
	container.style.transition = `opacity ${FADE_MS}ms`;
	container.style.opacity = "0";
	window.setTimeout(() => {
		hideWrapper();
		container.style.opacity = "1";
		gameViewReadyRegistry.broadcast();
	}, FADE_MS);
}

gameFirstFrameRegistry.register(hideAndNotifyReady);
gameLoadFailRegistry.register(hideWrapper);
