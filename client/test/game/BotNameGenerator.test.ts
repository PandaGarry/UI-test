import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import {BOT_NAME_GRID, botDisplayName} from "../../src/app/BotNameGenerator";

describe("bot display names", () => {
	test("names are unique for every bot id in a long game", () => {
		const seen = new Set<string>();
		for (let id = 0; id < BOT_NAME_GRID * 3; id++) {
			const name = botDisplayName(id);
			ok(!seen.has(name), `duplicate name ${name} at id ${id}`);
			seen.add(name);
		}
	});

	test("names are one readable word with no digits in the first grid", () => {
		for (let id = 0; id < BOT_NAME_GRID; id++) {
			ok(/^[A-Za-z]+$/.test(botDisplayName(id)), `unexpected name ${botDisplayName(id)}`);
		}
	});

	test("the first bots get the expected names", () => {
		strictEqual(botDisplayName(0), "Ashholm");
		strictEqual(botDisplayName(1), "Ironholm");
		strictEqual(botDisplayName(12), "Ashdale");
	});
});
