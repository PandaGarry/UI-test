import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import {botDisplayName, botNameCapacity, setBotNameMap} from "../../src/app/BotNameGenerator";
import {TRIBE_NAME_THEMES} from "../../src/app/TribeNameThemes";

const SAMPLE = 2000;

describe("bot display names (tribe themes, as the reference)", () => {
	test("no digits and no 'name N' suffixes, in either language, on every map", () => {
		for (const map of ["World", "Europe", "Africa", "Achiran"]) {
			for (const locale of ["en", "ru"]) {
				setBotNameMap(map, 7);
				for (let id = 0; id < SAMPLE; id++) {
					const name = botDisplayName(id, locale);
					ok(!/\d/.test(name), `digit in "${name}" (${map}, ${locale})`);
				}
			}
		}
	});

	test("every bot in a full game gets a unique name (English and Russian)", () => {
		for (const map of ["World", "Europe", "Africa"]) {
			for (const locale of ["en", "ru"]) {
				setBotNameMap(map, 42);
				const cap = Math.min(botNameCapacity(locale), 3000);
				const seen = new Set<string>();
				for (let id = 0; id < cap; id++) {
					const name = botDisplayName(id, locale);
					ok(!seen.has(name), `duplicate "${name}" at ${id} (${map}, ${locale})`);
					seen.add(name);
				}
			}
		}
	});

	test("English name is 'prefix suffix' from the map's theme", () => {
		setBotNameMap("Europe", 1);
		const europe = TRIBE_NAME_THEMES.europe.en;
		for (let id = 0; id < 200; id++) {
			const name = botDisplayName(id, "en");
			const match = europe.prefixes.some(p => europe.suffixes.some(s => name === `${p} ${s}`));
			ok(match, `"${name}" is a europe prefix + suffix`);
		}
	});

	test("Europe and Africa names never mix the themes", () => {
		setBotNameMap("Africa", 3);
		const africa = TRIBE_NAME_THEMES.africa.en;
		for (let id = 0; id < 300; id++) {
			const name = botDisplayName(id, "en");
			const match = africa.prefixes.some(p => africa.suffixes.some(s => name === `${p} ${s}`));
			ok(match, `"${name}" is an African prefix + suffix`);
		}
	});

	test("Russian name puts the suffix first, the people in the genitive: 'Империя римлян'", () => {
		setBotNameMap("World", 5);
		const ru = TRIBE_NAME_THEMES.default.ru;
		for (let id = 0; id < 200; id++) {
			const name = botDisplayName(id, "ru");
			const match = ru.prefixes.some(p => ru.suffixes.some(s => name === `${s} ${p}`));
			ok(match, `"${name}" is a Russian suffix + genitive prefix`);
		}
	});

	test("the game seed changes the order of names", () => {
		setBotNameMap("World", 1);
		const a = Array.from({length: 20}, (_, i) => botDisplayName(i, "en")).join("|");
		setBotNameMap("World", 2);
		const b = Array.from({length: 20}, (_, i) => botDisplayName(i, "en")).join("|");
		ok(a !== b, "different seed -> different names");
	});

	test("a map without its own theme uses the default theme", () => {
		setBotNameMap("Achiran", 0);
		const name = botDisplayName(0, "en");
		const d = TRIBE_NAME_THEMES.default.en;
		ok(d.prefixes.some(p => d.suffixes.some(s => name === `${p} ${s}`)), `"${name}" is from the default theme`);
		strictEqual(botNameCapacity("en"), TRIBE_NAME_THEMES.default.en.prefixes.length * TRIBE_NAME_THEMES.default.en.suffixes.length);
	});
});
