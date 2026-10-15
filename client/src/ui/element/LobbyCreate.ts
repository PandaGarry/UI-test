import {getDefaultMapIds} from "../../map/MapRegistry";
import {BalanceConfig} from "../../game/BalanceConfig";
import {tryStartGame} from "../../game/GameLoader";
import {GameModeIds} from "../../network/protocol/util/GameTypeIds";
import {getSetting} from "../../util/settings/UserSettingManager";
import {ui} from "../../util/Lang";
import type {uiStrings} from "../../util/Lang";
import {registerClickListener} from "../UIEventResolver";
import {hideUIElement, loadStaticElement, showUIElement} from "../UIManager";

//@module ui

// Create-lobby screen (Terron's HostLobbyModal, our style). Only offline lobbies with bots exist yet:
// private and public lobbies and bot difficulty are shown locked. Start uses the same path as any lobby.

loadStaticElement("LobbyCreate");

const startButton = document.getElementById("lobbyStart") as HTMLButtonElement;
const mapsContainer = document.getElementById("lobbyMaps") as HTMLElement;
const botsContainer = document.getElementById("lobbyBots") as HTMLElement;
const speedContainer = document.getElementById("lobbySpeed") as HTMLElement;

const defaultMapId = getDefaultMapIds().find(([id]) => id === "World")?.[0] ?? getDefaultMapIds()[0]?.[0] ?? "";

const lobbyState: {mapId: string; botCount: number; speed: number} = {
	mapId: defaultMapId,
	botCount: BalanceConfig.defaultBotCount,
	speed: BalanceConfig.defaultGameSpeed,
};

function getPlayerName(): string {
	const name = getSetting("player-name");
	return name === "UnknownPlayer" ? ui("menu.playerName.default") : name;
}

function renderMaps() {
	mapsContainer.replaceChildren(...getDefaultMapIds().map(([id, map]) => {
		const active = id === lobbyState.mapId;
		const button = document.createElement("button");
		button.type = "button";
		button.className = active ? "lobby-map is-active" : "lobby-map";
		button.setAttribute("aria-pressed", String(active));

		// Preview backgrounds come from CSS (class per map), so the build inlines the images like the menu's map card.
		const preview = document.createElement("span");
		preview.className = `lobby-map-preview lobby-map-preview-${id}`;
		preview.setAttribute("aria-hidden", "true");

		const name = document.createElement("span");
		name.className = "lobby-map-name";
		name.textContent = map.name;

		button.append(preview, name);
		button.addEventListener("click", () => {
			lobbyState.mapId = id;
			renderAll();
		});
		return button;
	}));
}

/** One segmented row of numeric options; the active option is marked with aria-pressed. */
function renderChoices(container: HTMLElement, options: readonly number[], format: (value: number) => string, current: () => number, pick: (value: number) => void) {
	container.replaceChildren(...options.map(value => {
		const active = value === current();
		const button = document.createElement("button");
		button.type = "button";
		button.className = active ? "lobby-seg-item is-active" : "lobby-seg-item";
		button.setAttribute("aria-pressed", String(active));
		button.textContent = format(value);
		button.addEventListener("click", () => {
			pick(value);
			renderAll();
		});
		return button;
	}));
}

function renderAll() {
	renderMaps();
	renderChoices(botsContainer, BalanceConfig.botCountOptions, String, () => lobbyState.botCount, value => { lobbyState.botCount = value; });
	renderChoices(speedContainer, BalanceConfig.gameSpeedOptions, value => `${value}×`, () => lobbyState.speed, value => { lobbyState.speed = value; });
}

// Static labels follow the active language; the page reloads when the language changes.
document.querySelectorAll<HTMLElement>("#LobbyCreateContainer [data-i18n]").forEach(element => {
	element.textContent = ui(element.dataset["i18n"] as keyof typeof uiStrings.eng);
});
document.getElementById("lobbyBack")?.setAttribute("aria-label", ui("lobby.back"));
document.getElementById("lobbyTypePrivate")?.setAttribute("aria-label", ui("lobby.type.private") + ": " + ui("menu.soon"));
document.getElementById("lobbyTypePublic")?.setAttribute("aria-label", ui("lobby.type.public") + ": " + ui("menu.soon"));

export function openLobbyCreate() {
	startButton.disabled = false;
	renderAll();
	hideUIElement("MainMenu");
	showUIElement("LobbyCreate");
}

function closeLobbyCreate() {
	hideUIElement("LobbyCreate");
	showUIElement("MainMenu");
}

registerClickListener("lobbyBack", closeLobbyCreate);
registerClickListener("lobbyStart", () => {
	// Disabled while the map loads, so a double click cannot start two matches.
	startButton.disabled = true;
	tryStartGame(lobbyState.mapId, GameModeIds.FFA, 23452345, [{name: getPlayerName()}], 0, true, lobbyState.botCount + 1, lobbyState.speed);
});
