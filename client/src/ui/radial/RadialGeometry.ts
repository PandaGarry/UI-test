/**
 * Radial menu geometry (no DOM). Values follow docs/RADIAL-MENU-REFERENCE-2026-10-18.md, section 2.
 * Angles are in radians, screen coordinates (y grows downwards); element 0 is centred on the top and the rest go clockwise.
 */

/** Radii in CSS pixels. The centre button is a circle of radius CENTER_RADIUS; in a submenu it shrinks to 0.8 of it. */
export const RADIAL_LAYOUT = {
	centerRadius: 30,
	centerBackScale: 0.8,
	centerHoverScale: 1.2,
	/** Gap between the menu and the window edge when it is clamped. */
	edgeGap: 10,
	/** Size of the element icon inside its button. */
	iconSize: 32,
	centerIconSize: 48,
} as const;

/** Inner and outer radius of a level: the root ring is 40–95; a submenu ring is 75–140 (further out, around the root). */
export function radiiForLevel(level: number): {inner: number; outer: number} {
	return level === 0 ? {inner: 40, outer: 95} : {inner: 75, outer: 140};
}

/** Start and end angle of the sector of element `index` out of `count`. */
export function sectorAngles(index: number, count: number): {start: number; end: number} {
	const step = (2 * Math.PI) / count;
	const start = -Math.PI / 2 + index * step - step / 2;
	return {start, end: start + step};
}

/** Position of the icon of element `index` (centre of the ring, on the sector axis), relative to the menu centre. */
export function iconPosition(index: number, count: number, inner: number, outer: number): {x: number; y: number} {
	const radius = (inner + outer) / 2;
	const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
	return {x: radius * Math.cos(angle), y: radius * Math.sin(angle)};
}

/** SVG path of the annular sector of element `index`, in a square whose centre is at (outer, outer). */
export function sectorPath(index: number, count: number, inner: number, outer: number): string {
	const {start, end} = sectorAngles(index, count);
	const at = (r: number, a: number) => `${outer + r * Math.cos(a)},${outer + r * Math.sin(a)}`;
	const largeArc = end - start > Math.PI ? 1 : 0;
	return [
		`M${at(inner, start)}`,
		`L${at(outer, start)}`,
		`A${outer},${outer} 0 ${largeArc} 1 ${at(outer, end)}`,
		`L${at(inner, end)}`,
		`A${inner},${inner} 0 ${largeArc} 0 ${at(inner, start)}`,
		"Z",
	].join(" ");
}

/**
 * Centre of the menu for a tap at (x, y): the tap point is kept when the whole menu fits in the window; it is pulled
 * inside the margin otherwise. On an axis where the menu does not fit at all (2 × margin > window), it is centred there.
 */
export function clampMenuPosition(
	x: number,
	y: number,
	outer: number,
	viewWidth: number,
	viewHeight: number,
): {x: number; y: number} {
	const margin = Math.max(outer, RADIAL_LAYOUT.centerRadius) + RADIAL_LAYOUT.edgeGap;
	return {x: clampAxis(x, margin, viewWidth), y: clampAxis(y, margin, viewHeight)};
}

function clampAxis(value: number, margin: number, size: number): number {
	if (2 * margin > size) return size / 2;
	return Math.min(Math.max(value, margin), size - margin);
}
