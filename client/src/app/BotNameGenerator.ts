/**
 * Bot display names: tribe / settlement names, built as in the reference game (OpenFrontIO, TribeNames.ts).
 *
 * A name is a prefix from the map's theme + a suffix from the same theme (see TribeNameThemes.ts):
 *   - English: "Roman Empire", "Apache Nation";
 *   - Russian: "Империя римлян", "Династия Тюдоров" (the suffix is the noun, the prefix is the people in the genitive).
 * No digits and no invented phrases: the names only ever come from the theme lists.
 *
 * Within one game every bot gets a different pair: all prefix x suffix pairs are shuffled once with the game seed,
 * and bots take them in that order, so names never repeat until every pair is used.
 */

import {TRIBE_NAME_THEMES, themesForMap, type TribeNameList} from "./TribeNameThemes";

type Pool = {prefixes: readonly string[]; suffixes: readonly string[]; order: Uint32Array};

let activeMap = "World";
let activeSeed = 0;
const pools = new Map<string, Pool>();

/** Set by the lobby when a game starts: the name list follows this map, the order follows this seed. */
export function setBotNameMap(mapId: string, seed: number = 0): void {
	if (mapId !== activeMap || seed !== activeSeed) {
		activeMap = mapId;
		activeSeed = seed;
		pools.clear();
	}
}

function buildList(themeIds: readonly string[], locale: "en" | "ru"): TribeNameList {
	const prefixes: string[] = [];
	const suffixes: string[] = [];
	for (const id of themeIds) {
		const theme = TRIBE_NAME_THEMES[id];
		if (theme === undefined) continue;
		prefixes.push(...theme[locale].prefixes);
		suffixes.push(...theme[locale].suffixes);
	}
	return {prefixes, suffixes};
}

/** Small seeded PRNG (mulberry32): the same seed always gives the same order. */
function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function poolFor(locale: "en" | "ru"): Pool {
	const cached = pools.get(locale);
	if (cached !== undefined) return cached;
	let list = buildList(themesForMap(activeMap), locale);
	if (list.prefixes.length === 0 || list.suffixes.length === 0) {
		list = buildList(["default"], locale);
	}
	const count = list.prefixes.length * list.suffixes.length;
	// Every (prefix, suffix) pair once, shuffled with the game seed: neighbouring bots differ in both parts.
	const order = new Uint32Array(count);
	for (let i = 0; i < count; i++) order[i] = i;
	const random = seededRandom(activeSeed);
	for (let i = count - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		const tmp = order[i];
		order[i] = order[j];
		order[j] = tmp;
	}
	const pool: Pool = {prefixes: list.prefixes, suffixes: list.suffixes, order};
	pools.set(locale, pool);
	return pool;
}

/**
 * Display name for a bot id. `locale` is "en" or "ru" (taken from the UI language). The same id gets the same name
 * within a game; neighbouring ids get different prefixes.
 */
export function botDisplayName(id: number, locale: string = "en"): string {
	const lang: "en" | "ru" = locale === "ru" ? "ru" : "en";
	const pool = poolFor(lang);
	const n = Math.max(0, Math.floor(id));
	const k = pool.order[n % pool.order.length];
	const prefix = pool.prefixes[k % pool.prefixes.length];
	const suffix = pool.suffixes[Math.floor(k / pool.prefixes.length)];
	return lang === "ru" ? `${suffix} ${prefix}` : `${prefix} ${suffix}`;
}

/** Number of distinct names the active map can give before they repeat. */
export function botNameCapacity(locale: string = "en"): number {
	return poolFor(locale === "ru" ? "ru" : "en").order.length;
}
