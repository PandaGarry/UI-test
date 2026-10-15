import {mapActionHandler} from "../../game/action/MapActionHandler";
import {gameStartRegistry} from "../../game/Game";
import {clientPlayer} from "../../game/player/PlayerManager";
import {territoryManager} from "../../game/TerritoryManager";

// Radial action menu, opened by a tap on the map once the game has started (own implementation;
// layout values in docs/RADIAL-MENU-SPEC-2026-10-15.md). Attack is the centre button and the red segment.

const ITEM_SIZE = 44;
const CENTER_SIZE = 56;
const RING_RADIUS = 78;

interface RadialItem {
	id: string;
	label: string;
	color: string;
	icon: string;
	/** Locked items show a lock badge and do nothing. */
	locked: boolean;
	/** Only enabled items run; disabled ones are dimmed. */
	enabled?: (tile: number) => boolean;
	run?: (tile: number) => void;
}

const ICON = {
	sword: '<path d="M14.5 3.5l6 6-10.5 10.5-6-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 20l3-3M7 14l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
	boat: '<path d="M3 14h18l-3 5H6zM7 14V8h10v6M12 4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
	info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
	build: '<path d="M4 20h16M6 20V10l6-5 6 5v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
	ally: '<circle cx="9" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>',
};

const isOwnTile = (tile: number) => territoryManager.getOwner(tile) === clientPlayer.id;

const ITEMS: RadialItem[] = [
	{id: "info", label: "Информация", color: "#475569", icon: ICON.info, locked: true},
	{id: "boat", label: "Морская атака", color: "#2a82c9", icon: ICON.boat, locked: true},
	{id: "ally", label: "Союз", color: "#4ade80", icon: ICON.ally, locked: true},
	{
		id: "attack",
		label: "Атака",
		color: "#ef4444",
		icon: ICON.sword,
		locked: false,
		enabled: tile => !isOwnTile(tile),
		run: tile => mapActionHandler.attackTile(tile),
	},
];

// Own territory has no attack; build is the action there (locked until the build stage).
const OWN_ITEMS: RadialItem[] = [
	{id: "info", label: "Информация", color: "#475569", icon: ICON.info, locked: true},
	{id: "build", label: "Строить", color: "#e6c74a", icon: ICON.build, locked: true},
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
	return root;
}

export function closeRadialMenu() {
	if (root) root.hidden = true;
	if (wrap) wrap.innerHTML = "";
}

function button(item: RadialItem, x: number, y: number, tile: number): HTMLButtonElement {
	const b = document.createElement("button");
	const enabled = !item.locked && (item.enabled ? item.enabled(tile) : true);
	b.className = "radial-item" + (item.locked ? " is-locked" : "") + (enabled ? "" : " is-disabled");
	b.style.left = `${x}px`;
	b.style.top = `${y}px`;
	b.style.width = `${ITEM_SIZE}px`;
	b.style.height = `${ITEM_SIZE}px`;
	b.style.background = item.color;
	b.title = item.label;
	b.setAttribute("aria-label", item.label);
	b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22">${item.icon}</svg>${item.locked ? '<span class="radial-lock"></span>' : ""}`;
	b.addEventListener("click", e => {
		e.stopPropagation();
		if (!enabled || !item.run) return;
		item.run(tile);
		closeRadialMenu();
	});
	return b;
}

/** Opens the menu at the tap position for the given tile. */
export function openRadialMenu(tile: number, screenX: number, screenY: number) {
	const r = ensureRoot();
	if (!wrap) {
		wrap = document.createElement("div");
		wrap.className = "radial-wrap";
		r.appendChild(wrap);
	}
	wrap.innerHTML = "";
	// Centre of the ring, kept on screen with a margin for the largest ring.
	const margin = RING_RADIUS + ITEM_SIZE / 2 + 8;
	const cx = Math.min(Math.max(screenX, margin), window.innerWidth - margin);
	const cy = Math.min(Math.max(screenY, margin), window.innerHeight - margin);
	wrap.style.left = `${cx}px`;
	wrap.style.top = `${cy}px`;

	const center = document.createElement("button");
	center.className = "radial-center";
	center.style.width = `${CENTER_SIZE}px`;
	center.style.height = `${CENTER_SIZE}px`;
	center.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26">${ICON.sword}</svg>`;
	center.title = "Атака";
	center.addEventListener("click", e => {
		e.stopPropagation();
		const attack = ITEMS.find(i => i.id === "attack");
		if (attack && !isOwnTile(tile)) attack.run?.(tile);
		closeRadialMenu();
	});
	wrap.appendChild(center);

	const items = isOwnTile(tile) ? OWN_ITEMS : ITEMS;
	items.forEach((item, i) => {
		const angle = -Math.PI / 2 + (i * 2 * Math.PI) / items.length;
		const x = Math.cos(angle) * RING_RADIUS;
		const y = Math.sin(angle) * RING_RADIUS;
		wrap!.appendChild(button(item, x, y, tile));
	});
	r.hidden = false;
}

// The menu is available once the game has started; during the spawn phase a tap selects the spawn.
gameStartRegistry.register(() => {
	mapActionHandler.setScreenAction((tile, x, y) => openRadialMenu(tile, x, y));
});
