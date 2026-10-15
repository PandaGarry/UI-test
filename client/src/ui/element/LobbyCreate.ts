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
// private and public lobbies, Teams and bot difficulty are shown locked. Start uses the same path as any lobby.

loadStaticElement("LobbyCreate");

const startButton = document.getElementById("lobbyStart") as HTMLButtonElement;
const mapsContainer = document.getElementById("lobbyMaps") as HTMLElement;
const speedContainer = document.getElementById("lobbySpeed") as HTMLElement;
const botsRange = document.getElementById("lobbyBotsRange") as HTMLInputElement;
const botsNumber = document.getElementById("lobbyBotsNumber") as HTMLInputElement;
const botsCard = botsRange.closest<HTMLElement>(".lobby-bots");
const summary = document.getElementById("lobbySummary") as HTMLElement;
const botsRow = document.getElementById("lobbyBotsRow") as HTMLElement;
const playersCount = document.getElementById("lobbyPlayersCount") as HTMLElement;
const hostName = document.getElementById("lobbyHostName") as HTMLElement;

const maps = getDefaultMapIds();
const defaultMapId = maps.find(([id]) => id === "World")?.[0] ?? maps[0]?.[0] ?? "";

const lobbyState: {mapId: string; random: boolean; botCount: number; speed: number} = {
	mapId: defaultMapId,
	random: false,
	botCount: BalanceConfig.defaultBotCount,
	speed: BalanceConfig.defaultGameSpeed,
};

function getPlayerName(): string {
	const name = getSetting("player-name");
	return name === "UnknownPlayer" ? ui("menu.playerName.default") : name;
}

function mapName(id: string): string {
	return maps.find(([mapId]) => mapId === id)?.[1].name ?? id;
}

function clampBots(value: number): number {
	if (!Number.isFinite(value)) return BalanceConfig.defaultBotCount;
	return Math.min(BalanceConfig.botCountMax, Math.max(BalanceConfig.botCountMin, Math.round(value)));
}

function renderMaps() {
	const randomActive = lobbyState.random;
	const random = document.createElement("button");
	random.type = "button";
	random.className = randomActive ? "lobby-map is-random is-active" : "lobby-map is-random";
	random.setAttribute("aria-pressed", String(randomActive));
	random.innerHTML = `<span class="lobby-map-preview lobby-map-preview-random" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg></span>`;
	const randomName = document.createElement("span");
	randomName.className = "lobby-map-name";
	randomName.textContent = ui("lobby.map.random");
	random.append(randomName);
	random.addEventListener("click", () => {
		lobbyState.random = true;
		renderAll();
	});

	const cards = maps.map(([id, map]) => {
		const active = !randomActive && id === lobbyState.mapId;
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
			lobbyState.random = false;
			renderAll();
		});
		return button;
	});
	mapsContainer.replaceChildren(random, ...cards);
}

function renderSpeed() {
	speedContainer.replaceChildren(...BalanceConfig.gameSpeedOptions.map(value => {
		const active = value === lobbyState.speed;
		const button = document.createElement("button");
		button.type = "button";
		button.className = active ? "lobby-seg-item is-active" : "lobby-seg-item";
		button.setAttribute("aria-pressed", String(active));
		button.textContent = `${value}×`;
		button.addEventListener("click", () => {
			lobbyState.speed = value;
			renderAll();
		});
		return button;
	}));
}

/** Keeps the slider, the number field, the summary and the players list in sync with botCount. */
function renderBots() {
	const count = lobbyState.botCount;
	botsRange.value = String(count);
	botsRange.style.setProperty("--fill", `${((count - BalanceConfig.botCountMin) / (BalanceConfig.botCountMax - BalanceConfig.botCountMin)) * 100}%`);
	if (document.activeElement !== botsNumber) botsNumber.value = String(count);
	botsCard?.classList.toggle("is-active", count > 0);
	botsRow.textContent = ui("lobby.bots.count").replace("{count}", String(count));
	playersCount.textContent = String(count + 1);
}

function renderSummary() {
	const map = lobbyState.random ? ui("lobby.map.random") : mapName(lobbyState.mapId);
	summary.textContent = ui("lobby.summary")
		.replace("{map}", map)
		.replace("{bots}", String(lobbyState.botCount))
		.replace("{speed}", `${lobbyState.speed}×`);
}

function renderAll() {
	renderMaps();
	renderSpeed();
	renderBots();
	renderSummary();
}

// Static labels follow the active language; the page reloads when the language changes.
document.querySelectorAll<HTMLElement>("#LobbyCreateContainer [data-i18n]").forEach(element => {
	element.textContent = ui(element.dataset["i18n"] as keyof typeof uiStrings.eng);
});
document.getElementById("lobbyBack")?.setAttribute("aria-label", ui("lobby.back"));
document.getElementById("lobbyTypePrivate")?.setAttribute("aria-label", ui("lobby.type.private") + ": " + ui("menu.soon"));
document.getElementById("lobbyTypePublic")?.setAttribute("aria-label", ui("lobby.type.public") + ": " + ui("menu.soon"));
botsRange.min = String(BalanceConfig.botCountMin);
botsRange.max = String(BalanceConfig.botCountMax);
botsNumber.min = String(BalanceConfig.botCountMin);
botsNumber.max = String(BalanceConfig.botCountMax);
hostName.textContent = getPlayerName();

botsRange.addEventListener("input", () => {
	lobbyState.botCount = clampBots(Number(botsRange.value));
	renderBots();
	renderSummary();
});
botsNumber.addEventListener("input", () => {
	// Typing is free; the value is only clamped on change so the user can type multi-digit numbers.
	if (botsNumber.value === "") return;
	lobbyState.botCount = clampBots(Number(botsNumber.value));
	renderBots();
	renderSummary();
});
botsNumber.addEventListener("change", () => {
	lobbyState.botCount = clampBots(Number(botsNumber.value));
	renderAll();
});

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
	const mapId = lobbyState.random
		? maps[Math.floor(Math.random() * maps.length)]?.[0] ?? lobbyState.mapId
		: lobbyState.mapId;
	tryStartGame(mapId, GameModeIds.FFA, 23452345, [{name: getPlayerName()}], 0, true, lobbyState.botCount + 1, lobbyState.speed);
});
