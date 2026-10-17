import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import {BOT_COUNTRY_COUNT, botDisplayName} from "../../src/app/BotNameGenerator";

describe("bot display names", () => {
	test("names are unique across countries and tribe names", () => {
		const seen = new Set<string>();
		for (let id = 0; id < BOT_COUNTRY_COUNT + 144 * 2; id++) {
			const name = botDisplayName(id, "en");
			ok(!seen.has(name), `duplicate name ${name} at id ${id}`);
			seen.add(name);
		}
	});

	test("the first bots are countries, in the UI language", () => {
		const en = botDisplayName(0, "en");
		const ru = botDisplayName(0, "ru");
		ok(en.length > 2 && en !== "AF", `english name is a country name, got ${en}`);
		ok(ru.length > 2, `russian name is a country name, got ${ru}`);
		ok(en !== ru, "names change with the language");
	});

	test("after the countries run out, tribe-style words follow", () => {
		strictEqual(botDisplayName(BOT_COUNTRY_COUNT, "en"), "Ashholm");
		strictEqual(botDisplayName(BOT_COUNTRY_COUNT + 1, "en"), "Ironholm");
		strictEqual(botDisplayName(BOT_COUNTRY_COUNT + 12, "en"), "Ashdale");
	});

	test("country order is a permutation of all countries (no repeats)", () => {
		const names = new Set<string>();
		for (let id = 0; id < BOT_COUNTRY_COUNT; id++) names.add(botDisplayName(id, "en"));
		strictEqual(names.size, BOT_COUNTRY_COUNT);
	});
});
