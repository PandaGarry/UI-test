import {mapActionHandler} from "../../game/action/MapActionHandler";
import {gameStartRegistry} from "../../game/Game";
import {clientPlayer} from "../../game/player/PlayerManager";
import {territoryManager} from "../../game/TerritoryManager";
import {blockInteraction} from "../UIEventResolver";
import {hasBorderWith} from "../../game/attack/AttackActionValidator";
import {setInspectedOwner} from "../../game/InspectedTarget";

// Radial action menu, opened by a tap on the map once the game has started (own implementation;
// layout values in docs/RADIAL-MENU-SPEC-2026-10-15.md). Attack is the centre button and the red segment.

// Layout follows the reference (IMG_5795): four pie quadrants centred on the axes (top, right, bottom, left),
// a dark centre button with the sword, unavailable items pale and translucent.
const INNER_R = 30;
const OUTER_R = 93;
const CENTER_R = 30;
const ICON_R = 67;
const ICON_SIZE = 40;
const SIZE = OUTER_R * 2;

interface RadialItem {
	id: string;
	label: string;
	color: string;
	icon: string;
	/** Available for this tile; unavailable items are pale and do nothing. */
	enabled: (tile: number) => boolean;
	run?: (tile: number) => void;
}

const ICON = {
	sword: '<path d="M20.5 3.5L10 14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6.5 10.5l7 7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M4 20l3.5-3.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
	boat: '<path d="M3 14h18l-3 5H6zM7 14V8h10v6M12 4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
	info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
	ally: '<circle cx="9" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>',
	build: '<path d="M4 20h16M6 20V10l6-5 6 5v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
	delete: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};

const isOwnTile = (tile: number) => territoryManager.getOwner(tile) === clientPlayer.id;

// Enemy or neutral tile: info, boat, alliance, attack (order as in the reference, clockwise from the top).
const ENEMY_ITEMS: RadialItem[] = [
	{id: "info", label: "Информация", color: "#e8edf3", icon: ICON.info, enabled: () => false},
	{
		id: "boat",
		label: "Морская атака",
		color: "#4a8ac4",
		icon: ICON.boat,
		enabled: tile => !isOwnTile(tile) && mapActionHandler.canBoatAttack(tile),
		run: tile => mapActionHandler.boatAttackTile(tile),
	},
	{id: "ally", label: "Союз", color: "#e8edf3", icon: ICON.ally, enabled: () => false},
	{
		id: "attack",
		label: "Атака",
		color: "#e0463f",
		icon: ICON.sword,
		// Land attack needs a shared border (the same check the attack action uses); otherwise the boat item applies.
		// Water is never a land target: the server rejects it, so the item stays off there (a border with water is not a border with a player).
		enabled: tile => !isOwnTile(tile) && !territoryManager.isWater(tile) && hasBorderWith(clientPlayer, territoryManager.getOwner(tile)),
		run: tile => mapActionHandler.attackTile(tile),
	},
];

// Own tile: the same four slots with the own-territory actions (not built yet, so grey).
const OWN_ITEMS: RadialItem[] = [
	{id: "info", label: "Информация", color: "#e8edf3", icon: ICON.info, enabled: () => false},
	{id: "delete", label: "Удалить юнит", color: "#e8edf3", icon: ICON.delete, enabled: () => false},
	{id: "ally", label: "Союз", color: "#e8edf3", icon: ICON.ally, enabled: () => false},
	{id: "build", label: "Строить", color: "#e8edf3", icon: ICON.build, enabled: () => false},
];

let root: HTMLDivElement | null = null;
let wrap: HTMLDivElement | null = null;

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
	return root;
}

/**
 * A ring button acts only on a click that started with a press on that button.
 * A tap that opens the ring is followed by a click synthesized at the same point (touch): the button
 * has just appeared under the finger, so that click must not fire the action.
 */
function onPressedClick(el: HTMLElement, action: () => void) {
	let pressed = false;
	el.addEventListener("pointerdown", () => { pressed = true; });
	el.addEventListener("click", e => {
		e.stopPropagation();
		const ok = pressed;
		pressed = false;
		if (ok) action();
	});
}

export function closeRadialMenu() {
	if (root) root.hidden = true;
	if (wrap) wrap.innerHTML = "";
}

function sector(index: number, count: number): string {
	// Quadrant i is centred on the axis at angle -90° + i·step: index 0 is the top, then clockwise.
	const step = (2 * Math.PI) / count;
	const a0 = -Math.PI / 2 + index * step - step / 2;
	const a1 = a0 + step;
	const p = (r: number, a: number) => `${SIZE / 2 + r * Math.cos(a)},${SIZE / 2 + r * Math.sin(a)}`;
	return `M${p(INNER_R, a0)} L${p(OUTER_R, a0)} A${OUTER_R},${OUTER_R} 0 0 1 ${p(OUTER_R, a1)} L${p(INNER_R, a1)} A${INNER_R},${INNER_R} 0 0 0 ${p(INNER_R, a0)} Z`;
}

function iconPosition(index: number, count: number): {x: number; y: number} {
	const step = (2 * Math.PI) / count;
	const a = -Math.PI / 2 + index * step;
	// Relative to the tap point (the wrapper origin), not to the SVG corner.
	return {x: ICON_R * Math.cos(a), y: ICON_R * Math.sin(a)};
}

/** Opens the menu at the tap position for the given tile. */
export function openRadialMenu(tile: number, screenX: number, screenY: number) {
	setInspectedOwner(territoryManager.getOwner(tile));
	const r = ensureRoot();
	if (!wrap) {
		wrap = document.createElement("div");
		wrap.className = "radial-wrap";
		r.appendChild(wrap);
	}
	wrap.innerHTML = "";
	const margin = SIZE / 2 + 8;
	wrap.style.left = `${Math.min(Math.max(screenX, margin), window.innerWidth - margin)}px`;
	wrap.style.top = `${Math.min(Math.max(screenY, margin), window.innerHeight - margin)}px`;

	const items = isOwnTile(tile) ? OWN_ITEMS : ENEMY_ITEMS;
	const count = items.length;
	const svgParts: string[] = [];
	items.forEach((item, i) => {
		const on = item.enabled(tile);
		svgParts.push(`<path class="radial-sector${on ? "" : " is-disabled"}" d="${sector(i, count)}" fill="${item.color}" data-id="${item.id}"/>`);
	});
	const svg = `<svg class="radial-svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${svgParts.join("")}</svg>`;
	wrap.insertAdjacentHTML("beforeend", svg);

	items.forEach((item, i) => {
		const on = item.enabled(tile);
		const pos = iconPosition(i, count);
		const b = document.createElement("button");
		b.className = "radial-icon" + (on ? "" : " is-disabled");
		b.style.left = `${pos.x}px`;
		b.style.top = `${pos.y}px`;
		b.title = item.label;
		b.setAttribute("aria-label", item.label);
		b.innerHTML = `<svg viewBox="0 0 24 24" width="${ICON_SIZE}" height="${ICON_SIZE}">${item.icon}</svg>`;
		onPressedClick(b, () => {
			if (!on || !item.run) return;
			item.run(tile);
			closeRadialMenu();
		});
		wrap!.appendChild(b);
	});

	const center = document.createElement("button");
	center.className = "radial-center";
	center.style.width = `${CENTER_R * 2}px`;
	center.style.height = `${CENTER_R * 2}px`;
	center.style.left = "0px";
	center.style.top = "0px";
	center.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30">${ICON.sword}</svg>`;
	center.title = "Атака";
	onPressedClick(center, () => {
		if (!isOwnTile(tile)) mapActionHandler.attackTile(tile);
		closeRadialMenu();
	});
	wrap.appendChild(center);
	r.hidden = false;
}

// The menu is available once the game has started; during the spawn phase a tap selects the spawn.
gameStartRegistry.register(() => {
	// During play a tap opens the ring at the tap point; the camera is controlled by the player only.
	mapActionHandler.setScreenAction((tile, x, y) => openRadialMenu(tile, x, y));
});
