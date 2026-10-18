import {getDefaultMapIds} from "../../loader/MapRegistry";
import {BalanceConfig} from "@frontline/core/game/BalanceConfig";
import type {NationDifficulty} from "@frontline/core/game/nation/NationPlayer";
import {tryStartGame} from "../../loader/GameLoader";
import {preloadMap} from "../../loader/MapRegistry";
import {GameModeIds} from "@frontline/core/protocol/util/GameTypeIds";
import {getSetting} from "../../platform/settings/UserSettingManager";
import {ui} from "../../platform/Lang";
import type {uiStrings} from "../../platform/Lang";
import {registerClickListener} from "../UIEventResolver";
import {showLoadingOverlay} from "./LoadingOverlay";
import {setBotNameMap} from "../../app/BotNameGenerator";
import {hideUIElement, loadStaticElement, showUIElement} from "../UIManager";


// Create-lobby screen (Terron's HostLobbyModal, our style). Only offline lobbies with bots exist yet:
// private and public lobbies, Teams and bot difficulty are shown locked. Start uses the same path as any lobby.

loadStaticElement("LobbyCreate");

const startButton = document.getElementById("lobbyStart") as HTMLButtonElement;
const mapsContainer = document.getElementById("lobbyMaps") as HTMLElement;
const botsRange = document.getElementById("lobbyBotsRange") as HTMLInputElement;
const botsNumber = document.getElementById("lobbyBotsNumber") as HTMLInputElement;
const botsCard = botsRange.closest<HTMLElement>(".lobby-bots");
const summary = document.getElementById("lobbySummary") as HTMLElement;
const botsRow = document.getElementById("lobbyBotsRow") as HTMLElement;
const playersCount = document.getElementById("lobbyPlayersCount") as HTMLElement;
const hostName = document.getElementById("lobbyHostName") as HTMLElement;
const startFill = document.getElementById("lobbyStartFill") as HTMLElement;
const startLabel = document.getElementById("lobbyStartLabel") as HTMLElement;

// CANCEL WINDOW (BalanceConfig.lobbyStartDelaySeconds): pressing Start begins a countdown; pressing it again or leaving
// the screen cancels it. It is NOT the spawn-selection timer (that is SPAWN_PHASE_MS in packages/core/src/game/Game.ts).
const startDelayMs = BalanceConfig.lobbyStartDelaySeconds * 1000;
let countdownTimer: number | null = null;
let countdownEndsAt = 0;

const maps = getDefaultMapIds();
const defaultMapId = maps.find(([id]) => id === "World")?.[0] ?? maps[0]?.[0] ?? "";

const lobbyState: {mapId: string; random: boolean; botCount: number; states: boolean; nationDifficulty: NationDifficulty} = {
	mapId: defaultMapId,
	random: false,
	botCount: BalanceConfig.defaultBotCount,
	states: true,
	nationDifficulty: BalanceConfig.defaultNationDifficulty,
};

const statesButton = document.getElementById("lobbyStates") as HTMLButtonElement;
const statesState = document.getElementById("lobbyStatesState") as HTMLElement;
const difficultyButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#lobbyNationDifficulty [data-difficulty]"));

const difficultyInfo = document.getElementById("lobbyDifficultyInfo") as HTMLElement;

/** One skull per level, the burning one for Impossible (drawn here, not copied from the reference). */
const SKULL_PATH = "M6 1.2a4.6 4.6 0 0 0-4.6 4.6c0 1.6.8 2.8 1.9 3.5V10.6h5.4V9.3c1.1-.7 1.9-1.9 1.9-3.5A4.6 4.6 0 0 0 6 1.2z";
const BURNING_PATH = "M6 0.4c1 1.6 2 2.6 1.6 4.2 1.4-.4 2.4-1.6 2.4-1.6.4 1.4-.2 2.6-.2 2.6A4.6 4.6 0 0 1 1.4 5.8 4.6 4.6 0 0 1 6 0.4z";

function renderSkulls() {
	for (const holder of document.querySelectorAll<HTMLElement>("#lobbyNationDifficulty [data-skulls]")) {
		const count = Number(holder.dataset["skulls"]);
		const burning = holder.dataset["burning"] === "1";
		const eyes = '<circle cx="4.3" cy="5" r="1" fill="#2b2620"/><circle cx="7.7" cy="5" r="1" fill="#2b2620"/>';
		const one = `<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="${burning ? BURNING_PATH : SKULL_PATH}" fill="currentColor"/>${eyes}</svg>`;
		holder.innerHTML = one.repeat(count);
	}
}

/** Reference lobby options: the states switch and the game difficulty, which also sets the bots (Medium is the reference default). */
function renderStates() {
	statesButton.classList.toggle("is-active", lobbyState.states);
	statesButton.setAttribute("aria-pressed", String(lobbyState.states));
	statesState.textContent = ui(lobbyState.states ? "lobby.states.on" : "lobby.states.off");
	for (const button of difficultyButtons) {
		const active = button.dataset["difficulty"] === lobbyState.nationDifficulty;
		button.classList.toggle("is-active", active);
		button.setAttribute("aria-pressed", String(active));
	}
	const level = lobbyState.nationDifficulty;
	const troops = String(BalanceConfig.nationDifficulty[level].startTroops).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
	difficultyInfo.textContent = ui(`lobby.difficulty.info.${level}`).replace("{troops}", troops);
}

renderSkulls();

statesButton.addEventListener("click", () => {
	lobbyState.states = !lobbyState.states;
	renderStates();
});
for (const button of difficultyButtons) {
	button.addEventListener("click", () => {
		lobbyState.nationDifficulty = button.dataset["difficulty"] as NationDifficulty;
		renderStates();
	});
}

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
		.replace("{bots}", String(lobbyState.botCount));
}

function renderAll() {
	renderMaps();
	renderBots();
	renderStates();
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

function stopCountdown() {
	if (countdownTimer !== null) {
		clearInterval(countdownTimer);
		countdownTimer = null;
	}
}

/** Back to the idle "Start game" state (also used to cancel the countdown). */
function setStartIdle() {
	stopCountdown();
	startButton.classList.remove("is-counting");
	startButton.disabled = false;
	startFill.style.width = "0%";
	startLabel.textContent = ui("lobby.start");
}

function tickCountdown() {
	const left = countdownEndsAt - Date.now();
	if (left <= 0) {
		stopCountdown();
		launchGame();
		return;
	}
	startFill.style.width = `${(1 - left / startDelayMs) * 100}%`;
	startLabel.textContent = ui("lobby.start.counting").replace("{s}", String(Math.ceil(left / 1000)));
}

function beginCountdown() {
	// Start building the chosen map while the countdown runs, so the game does not freeze at the end of it.
	if (!lobbyState.random) preloadMap(lobbyState.mapId).catch(() => undefined);
	startButton.classList.add("is-counting");
	countdownEndsAt = Date.now() + startDelayMs;
	tickCountdown();
	countdownTimer = window.setInterval(tickCountdown, 100);
}

function launchGame() {
	// Disabled while the map loads, so a double click cannot start two matches.
	startButton.classList.remove("is-counting");
	startButton.disabled = true;
	startFill.style.width = "100%";
	startLabel.textContent = ui("lobby.start.starting");
	const mapId = lobbyState.random
		? maps[Math.floor(Math.random() * maps.length)]?.[0] ?? lobbyState.mapId
		: lobbyState.mapId;
	const gameSeed = Math.floor(Math.random() * 0x7fffffff);
	// The bot names follow the map and the same seed as the game, so every game gets its own order of names.
	setBotNameMap(mapId, gameSeed);
	showLoadingOverlay(mapName(mapId));
	// The window must be painted BEFORE the synchronous game setup blocks the main thread; otherwise it appears only
	// after the map is loaded (a visible gap after the cancel countdown). Two frames: the first commits the style, the second paints.
	requestAnimationFrame(() => requestAnimationFrame(() => {
		tryStartGame(mapId, GameModeIds.FFA, gameSeed, [{name: getPlayerName()}], 0, true, lobbyState.botCount + 1, BalanceConfig.defaultGameSpeed, {enabled: lobbyState.states, difficulty: lobbyState.nationDifficulty});
	}));
}

export function openLobbyCreate() {
	setStartIdle();
	renderAll();
	hideUIElement("MainMenu");
	showUIElement("LobbyCreate");
}

function closeLobbyCreate() {
	setStartIdle();
	hideUIElement("LobbyCreate");
	showUIElement("MainMenu");
}

registerClickListener("lobbyBack", closeLobbyCreate);
registerClickListener("lobbyStart", () => {
	if (countdownTimer !== null) {
		setStartIdle();
		return;
	}
	beginCountdown();
});
