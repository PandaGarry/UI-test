import {mapActionHandler} from "../../input/MapActionHandler";
import {gameStartRegistry} from "@frontline/core/game/Game";
import {blockInteraction} from "../UIEventResolver";
import {setInspectedOwner} from "@frontline/core/game/InspectedTarget";
import {territoryManager} from "@frontline/core/game/TerritoryManager";
import {RadialMenuModel, type RadialNode, type RadialOutcome} from "../radial/RadialModel";
import {RADIAL_LAYOUT, clampMenuPosition, iconPosition, radiiForLevel, sectorPath} from "../radial/RadialGeometry";
import {buildTileMenu, type TileMenu} from "./RadialMenuItems";

// Radial action menu, opened by a tap on the map once the game has started. The rules (which elements exist, what a tap
// does, levels, cooldown) are in ui/radial/RadialModel.ts; the geometry is in ui/radial/RadialGeometry.ts; the values
// follow docs/RADIAL-MENU-REFERENCE-2026-10-18.md. This file only draws the current level and forwards taps.

/** Refresh of the elements while the menu is open (reference: MainRadialMenu, 500 ms). */
const REFRESH_MS = 500;
/** Grey of an unavailable element (reference disabledColor). */
const DISABLED_FILL = "rgb(128,128,128)";

/** Look of each element by id (colour and icon). The label and the hint come from the model. */
const STYLE: Record<string, {color: string; icon: string}> = {
	info: {color: "#e8edf3", icon: "info"},
	boat: {color: "#4a8ac4", icon: "boat"},
	ally: {color: "#e8edf3", icon: "ally"},
	attack: {color: "#e0463f", icon: "sword"},
	delete: {color: "#e8edf3", icon: "delete"},
	build: {color: "#e8edf3", icon: "build"},
};

const ICON: Record<string, string> = {
	sword: '<path d="M20.5 3.5L10 14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6.5 10.5l7 7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M4 20l3.5-3.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
	boat: '<path d="M3 14h18l-3 5H6zM7 14V8h10v6M12 4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
	info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
	ally: '<circle cx="9" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>',
	build: '<path d="M4 20h16M6 20V10l6-5 6 5v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
	delete: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
	back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

const model = new RadialMenuModel();
let root: HTMLDivElement | null = null;
let wrap: HTMLDivElement | null = null;
let tip: HTMLDivElement | null = null;
let tileShown = -1;
let tapX = 0;
let tapY = 0;
let lastSignature = "";
let refreshTimer = 0;

function ensureRoot(): HTMLDivElement {
	if (root) return root;
	root = document.createElement("div");
	root.id = "radialRoot";
	root.className = "radial-root";
	root.hidden = true;
	// A tap on the dimmed background closes the menu; taps on buttons do not reach it.
	root.addEventListener("pointerdown", e => {
		if (e.target === root) closeRadialMenu();
	});
	document.body.appendChild(root);
	// Taps on the menu must not reach the map handler (it would re-open the menu under the finger).
	blockInteraction(root);

	wrap = document.createElement("div");
	wrap.className = "radial-wrap";
	root.appendChild(wrap);

	tip = document.createElement("div");
	tip.className = "radial-tip";
	tip.hidden = true;
	root.appendChild(tip);
	return root;
}

/**
 * A ring button acts on the press itself (pointerdown), as the reference does with touchstart on its sectors.
 * A click only stops propagation, so the map handler never sees it. Acting on press means a tap that opens the
 * ring (completed on pointerup, followed by a synthesized click) cannot trigger an action on the new button.
 */
function onActivate(el: HTMLElement, action: () => void) {
	el.addEventListener("pointerdown", e => {
		if (e.pointerType === "mouse" && e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		action();
	});
	el.addEventListener("click", e => e.stopPropagation());
}

/** Identifies the content of a menu state: when it changes, the level is redrawn. */
function signature(menu: TileMenu): string {
	const part = (n: RadialNode) => `${n.id}:${n.enabled ? 1 : 0}:${n.hint}`;
	return `${menu.items.map(part).join("|")}#${part(menu.center)}`;
}

function showTip(node: RadialNode, e: PointerEvent) {
	if (!tip) return;
	tip.innerHTML = "";
	const title = document.createElement("b");
	title.textContent = node.label;
	const hint = document.createElement("span");
	hint.textContent = node.hint;
	tip.append(title, hint);
	moveTip(e);
	tip.hidden = false;
}

function moveTip(e: PointerEvent) {
	if (!tip) return;
	// The tooltip follows the pointer, offset by 10 px.
	tip.style.left = `${e.clientX + 10}px`;
	tip.style.top = `${e.clientY + 10}px`;
}

function hideTip() {
	if (tip) tip.hidden = true;
}

function setHover(id: string, on: boolean) {
	if (!wrap) return;
	const sector = wrap.querySelector(`path[data-id="${id}"]`);
	sector?.classList.toggle("is-hover", on);
}

/** What is on screen: depth, element ids and the centre. A change of this key rebuilds the level, anything else is patched. */
function structureKey(): string {
	const center = model.centerNode();
	return `${model.depth()}|${model.items().map(n => n.id).join(",")}|${center ? center.id : "-"}|${model.centerState()}`;
}

let builtKey = "";

/** Draws the current level of the model at the tap point. Rebuilds the DOM only when the structure changes (or on animation). */
function render(animate: boolean) {
	const host = wrap;
	if (!host) return;
	const level = model.depth();
	const {inner, outer} = radiiForLevel(level);
	const size = outer * 2;
	const pos = clampMenuPosition(tapX, tapY, outer, window.innerWidth, window.innerHeight);
	host.style.left = `${pos.x}px`;
	host.style.top = `${pos.y}px`;
	const key = structureKey();
	if (!animate && key === builtKey && host.firstElementChild) {
		patchLevel(host.firstElementChild as HTMLElement);
		return;
	}
	builtKey = key;
	host.innerHTML = "";
	hideTip();

	const items = model.items();
	const count = items.length;
	const centerNode = model.centerNode();
	const backState = model.centerState() === "back";

	const layer = document.createElement("div");
	layer.className = "radial-level" + (animate ? " is-entering" : "");
	layer.style.width = `${size}px`;
	layer.style.height = `${size}px`;
	layer.style.left = `${-outer}px`;
	layer.style.top = `${-outer}px`;

	const sectors = items.map((node, i) => {
		const style = STYLE[node.id] ?? {color: "#e8edf3", icon: "info"};
		const fill = node.enabled ? style.color : DISABLED_FILL;
		const cls = "radial-sector" + (node.enabled ? "" : " is-disabled");
		return `<path class="${cls}" d="${sectorPath(i, count, inner, outer)}" fill="${fill}" data-id="${node.id}"/>`;
	});
	layer.insertAdjacentHTML("beforeend", `<svg class="radial-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${sectors.join("")}</svg>`);

	items.forEach((node, i) => {
		const style = STYLE[node.id] ?? {icon: "info"};
		const p = iconPosition(i, count, inner, outer);
		const b = document.createElement("button");
		b.type = "button";
		b.className = "radial-icon" + (node.enabled ? "" : " is-disabled");
		b.dataset["id"] = node.id;
		b.style.left = `${outer + p.x}px`;
		b.style.top = `${outer + p.y}px`;
		b.setAttribute("aria-label", node.label);
		b.setAttribute("aria-disabled", node.enabled ? "false" : "true");
		b.innerHTML = `<svg viewBox="0 0 24 24" width="${RADIAL_LAYOUT.iconSize}" height="${RADIAL_LAYOUT.iconSize}">${ICON[style.icon] ?? ""}</svg>`;
		b.addEventListener("pointerenter", e => {
			if (e.pointerType !== "mouse") return;
			const current = model.items().find(n => n.id === node.id);
			if (!model.isTransitioning(performance.now())) setHover(node.id, true);
			if (current) showTip(current, e);
		});
		b.addEventListener("pointermove", e => { if (e.pointerType === "mouse") moveTip(e); });
		b.addEventListener("pointerleave", () => {
			setHover(node.id, false);
			hideTip();
		});
		onActivate(b, () => handle(model.select(node.id, performance.now())));
		layer.appendChild(b);
	});

	if (centerNode) {
		const center = document.createElement("button");
		center.type = "button";
		center.className = "radial-center";
		center.dataset["role"] = "center";
		center.setAttribute("aria-label", backState ? "Назад" : centerNode.label);
		const radius = backState ? RADIAL_LAYOUT.centerRadius * RADIAL_LAYOUT.centerBackScale : RADIAL_LAYOUT.centerRadius;
		center.style.width = `${radius * 2}px`;
		center.style.height = `${radius * 2}px`;
		// The centre button sits in the middle of the ring: the level origin is its top-left corner, the middle is (outer, outer).
		center.style.left = `${outer}px`;
		center.style.top = `${outer}px`;
		const icon = backState ? ICON["back"] : ICON["sword"];
		center.innerHTML = `<svg viewBox="0 0 24 24" width="${RADIAL_LAYOUT.centerIconSize}" height="${RADIAL_LAYOUT.centerIconSize}">${icon}</svg>`;
		center.addEventListener("pointerenter", e => {
			if (e.pointerType === "mouse" && center.getAttribute("aria-disabled") !== "true") center.classList.add("is-hover");
		});
		center.addEventListener("pointerleave", () => center.classList.remove("is-hover"));
		onActivate(center, () => handle(model.pressCenter(performance.now())));
		layer.appendChild(center);
	}

	host.appendChild(layer);
	patchLevel(layer);
}

/** Updates availability, colours and labels of the drawn level in place (no DOM replacement, so no lost presses). */
function patchLevel(layer: HTMLElement) {
	const items = model.items();
	items.forEach(node => {
		const style = STYLE[node.id] ?? {color: "#e8edf3"};
		const sector = layer.querySelector<SVGPathElement>(`path[data-id="${node.id}"]`);
		if (sector) {
			sector.setAttribute("fill", node.enabled ? style.color : DISABLED_FILL);
			sector.setAttribute("class", "radial-sector" + (node.enabled ? "" : " is-disabled"));
		}
		const button = layer.querySelector<HTMLButtonElement>(`button.radial-icon[data-id="${node.id}"]`);
		if (button) {
			button.className = "radial-icon" + (node.enabled ? "" : " is-disabled");
			button.setAttribute("aria-label", node.label);
			button.setAttribute("aria-disabled", node.enabled ? "false" : "true");
		}
	});
	const center = layer.querySelector<HTMLButtonElement>("button.radial-center");
	const centerNode = model.centerNode();
	if (center && centerNode) {
		const backState = model.centerState() === "back";
		const enabled = backState || centerNode.enabled;
		center.className = "radial-center" + (backState ? " is-back" : "") + (enabled ? "" : " is-disabled");
		center.setAttribute("aria-disabled", enabled ? "false" : "true");
		center.setAttribute("aria-label", backState ? "Назад" : centerNode.label);
	}
}

/** Applies the outcome of a tap: redraw after a level change, close after an action. */
function handle(outcome: RadialOutcome) {
	if (outcome === "ran") {
		closeRadialMenu();
		return;
	}
	if (outcome === "navigated" || outcome === "back") render(true);
}

function refreshTick() {
	if (!model.isOpen()) return;
	const menu = buildTileMenu(tileShown);
	const sig = signature(menu);
	if (sig === lastSignature) return;
	lastSignature = sig;
	model.refresh(menu.items, menu.center);
	render(false);
}

function onWindowResize() {
	if (model.isOpen()) render(false);
}

export function closeRadialMenu() {
	model.closeMenu(performance.now());
	window.clearInterval(refreshTimer);
	refreshTimer = 0;
	window.removeEventListener("resize", onWindowResize);
	if (root) root.hidden = true;
	if (wrap) wrap.innerHTML = "";
	hideTip();
}

/** Opens the menu at the tap position for the given tile (no-op during the reopen cooldown). */
export function openRadialMenu(tile: number, screenX: number, screenY: number) {
	const menu = buildTileMenu(tile);
	if (!model.openMenu(menu.items, menu.center, performance.now())) return;
	setInspectedOwner(territoryManager.getOwner(tile));
	const r = ensureRoot();
	tileShown = tile;
	tapX = screenX;
	tapY = screenY;
	lastSignature = signature(menu);
	r.hidden = false;
	render(false);
	refreshTimer = window.setInterval(refreshTick, REFRESH_MS);
	window.addEventListener("resize", onWindowResize);
}

// The menu is available once the game has started; during the spawn phase a tap selects the spawn.
gameStartRegistry.register(() => {
	closeRadialMenu();
	// During play a tap opens the ring at the tap point; the camera is controlled by the player only.
	mapActionHandler.setScreenAction((tile, x, y) => openRadialMenu(tile, x, y));
});
