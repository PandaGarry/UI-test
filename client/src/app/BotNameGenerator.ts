/**
 * Display names for bots: a prefix and a suffix joined into one word (e.g. "Ashholm", "Frostmoor").
 * Names are readable on the map label and need no translation. The lists are our own words.
 *
 * Unique per bot id: the id picks the prefix and the suffix as two digits of a 12 x 12 grid. Beyond 144 bots the
 * grid wraps and a roman-style number is appended so names stay distinct.
 */
const PREFIXES = ["Ash", "Iron", "Storm", "Frost", "Ember", "Stone", "Raven", "Wolf", "Silver", "Dusk", "Thorn", "Crow"];
const SUFFIXES = ["holm", "dale", "ward", "mark", "reach", "crest", "fall", "gard", "moor", "vale", "wick", "haven"];

export const BOT_NAME_GRID = PREFIXES.length * SUFFIXES.length;

export function botDisplayName(id: number): string {
	const n = Math.max(0, Math.floor(id));
	const word = PREFIXES[n % PREFIXES.length] + SUFFIXES[Math.floor(n / PREFIXES.length) % SUFFIXES.length];
	const cycle = Math.floor(n / BOT_NAME_GRID);
	return cycle === 0 ? word : `${word} ${cycle + 1}`;
}
