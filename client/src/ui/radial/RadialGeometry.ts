import {arc as d3Arc} from "d3-shape";

/**
 * Radial menu geometry (no DOM). Values follow the reference (src/client/hud/layers/RadialMenu.ts: d3.pie with
 * padAngle 0.03, d3.arc radii 40–95 and 75–140; icon centres at the middle of each ring) and
 * docs/RADIAL-MENU-REFERENCE-2026-10-18.md, section 2.
 * Angles of sectorAngles/iconPosition are in radians in screen coordinates (y grows downwards); element 0 is centred on
 * the top and the rest go clockwise. sectorPath uses d3's convention (0 = top, clockwise) and is centred on (0, 0).
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

/** Gap between neighbouring sectors, radians (reference pie.padAngle(0.03)). */
export const SECTOR_PAD_ANGLE = 0.03;

/**
 * SVG path of the annular sector of element `index`, centred on (0, 0). Built with d3-shape's arc generator, as in the
 * reference, so the padding between sectors is the same.
 */
export function sectorPath(index: number, count: number, inner: number, outer: number): string {
	const {start, end} = sectorAngles(index, count);
	// d3 angles: 0 at the top, clockwise. Our screen angle a (0 at the right) maps to d3 angle a + π/2.
	const generator = d3Arc().innerRadius(inner).outerRadius(outer).padAngle(SECTOR_PAD_ANGLE);
	return generator({innerRadius: inner, outerRadius: outer, startAngle: start + Math.PI / 2, endAngle: end + Math.PI / 2, padAngle: SECTOR_PAD_ANGLE}) ?? "";
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
