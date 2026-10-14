import {describe, test} from "node:test";
import {deepEqual, ok} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {rus, uiStrings} from "../../src/util/Lang";

// The map name renderer draws strings from the MSDF atlas only, so every character
// that can appear in a localized UI string (or in a player/bot name) must be in it.
const atlas = JSON.parse(readFileSync(resolve(__dirname, "../../resources/fonts/opensans-regular.json"), "utf8"));
const glyphs = new Set<number>(atlas.chars.map((c: {id: number}) => c.id));

function missingChars(strings: string[]): string[] {
	const missing = new Set<string>();
	for (const s of strings) {
		for (let i = 0; i < s.length; i++) {
			if (!glyphs.has(s.charCodeAt(i))) missing.add(s[i]);
		}
	}
	return [...missing];
}

describe("MSDF font atlas coverage", () => {
	test("Russian alphabet is fully covered", () => {
		const alphabet = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя";
		deepEqual(missingChars([alphabet]), []);
	});

	test("all Russian UI strings are covered", () => {
		deepEqual(missingChars(Object.values(uiStrings.rus)), []);
		deepEqual(missingChars(Object.values(rus).filter((v): v is string => typeof v === "string")), []);
	});

	test("all English UI strings are covered", () => {
		deepEqual(missingChars(Object.values(uiStrings.eng)), []);
	});

	test("bot names in both languages are covered", () => {
		deepEqual(missingChars([`${uiStrings.rus["bot.name"]} 12`, `${uiStrings.eng["bot.name"]} 12`]), []);
	});

	test("atlas has the expected metrics for the renderer", () => {
		ok(atlas.common.lineHeight > 0);
		ok(atlas.chars.every((c: {width: number, height: number, xadvance: number}) => c.width < 256 && c.height < 256 && c.xadvance < 256));
	});
});
