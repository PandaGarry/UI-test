import {HSLColor} from "../../util/HSLColor";
import {hash32} from "../Random";

/**
 * One colour range for players and bots (visual only, the game logic never reads colours).
 * 12 hues 30 degrees apart, each in two lightness levels: 24 colours. The order is shuffled by the game seed, so
 * colours are not tied to a player or bot slot and change from game to game. The first 24 players of a game
 * always get different colours.
 */
const HUE_STEPS = 12;
const LIGHTNESS_LEVELS: readonly number[] = [0.46, 0.6];
const SATURATION = 0.72;

let paletteSeed = 0;

/** Called once per game (startGame) before any player or bot is created. */
export function setPaletteSeed(seed: number): void {
	paletteSeed = seed;
}

function baseColors(): HSLColor[] {
	const colors: HSLColor[] = [];
	for (let i = 0; i < HUE_STEPS; i++) {
		for (const lightness of LIGHTNESS_LEVELS) {
		    // The lighter level is shifted by 15 degrees, so neighbours on the hue circle differ in both hue and lightness.
		    colors.push(new HSLColor(i * (360 / HUE_STEPS) + (lightness > 0.5 ? 15 : 0), SATURATION, lightness, 1));
		}
	}
	return colors;
}

let cachedOrder: number[] | null = null;
let cachedSeed = Number.NaN;

function shuffledOrder(seed: number, size: number): number[] {
	if (cachedOrder && cachedSeed === seed && cachedOrder.length === size) return cachedOrder;
	const order = Array.from({length: size}, (_, i) => i);
	for (let i = size - 1; i > 0; i--) {
		const j = hash32((seed ^ Math.imul(i, 0x9e3779b1)) >>> 0) % (i + 1);
		[order[i], order[j]] = [order[j], order[i]];
	}
	cachedOrder = order;
	cachedSeed = seed;
	return order;
}

/** Colour for a slot (player or bot id) in the current game. */
export function paletteColor(index: number, seed: number = paletteSeed): HSLColor {
	const colors = baseColors();
	const order = shuffledOrder(seed, colors.length);
	return colors[order[index % colors.length]];
}
