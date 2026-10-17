import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import {botCountryCount, botDisplayName, setBotNameMap} from "../../src/app/BotNameGenerator";

describe("bot display names", () => {
  test("World: every bot in a full game gets a unique name", () => {
    setBotNameMap("World");
    const total = botCountryCount() + 200;
    const seen = new Set<string>();
    for (let id = 0; id < total; id++) {
      const name = botDisplayName(id, "en");
      ok(!seen.has(name), `duplicate ${name} at ${id}`);
      seen.add(name);
    }
  });

  test("Europe and Africa use only their own countries first", () => {
    setBotNameMap("Europe");
    const europe = botCountryCount();
    const eu = new Set<string>();
    for (let id = 0; id < europe; id++) eu.add(botDisplayName(id, "en"));
    strictEqual(eu.size, europe);
    ok(eu.has("Germany") && eu.has("France"), "European names present");
    ok(!eu.has("Egypt"), "no African countries on Europe");

    setBotNameMap("Africa");
    const af = new Set<string>();
    for (let id = 0; id < botCountryCount(); id++) af.add(botDisplayName(id, "en"));
    ok(af.has("Egypt") && !af.has("Germany"), "African names only on Africa");
  });

  test("names come in the UI language", () => {
    setBotNameMap("World");
    const en = botDisplayName(0, "en");
    const ru = botDisplayName(0, "ru");
    ok(en !== ru, "names change with the language");
    ok(en.length > 2 && ru.length > 2, "country names, not codes");
  });

  test("a map without a country list gets generated names only, unique", () => {
    setBotNameMap("Achiran");
    strictEqual(botCountryCount(), 0);
    const seen = new Set<string>();
    for (let id = 0; id < 100; id++) {
      const name = botDisplayName(id, "en");
      ok(!seen.has(name), `duplicate ${name}`);
      seen.add(name);
    }
  });
});
