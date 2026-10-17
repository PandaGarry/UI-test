import {describe, test} from "node:test";
import {notStrictEqual, ok, strictEqual} from "node:assert";
import {paletteColor} from "../../../packages/core/src/game/player/PlayerPalette";

const key = (c: {h: number; l: number}) => `${Math.round(c.h)}:${Math.round(c.l * 100)}`;

describe("player and bot palette", () => {
  test("the first 24 slots of a game get 24 different colours", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) seen.add(key(paletteColor(i, 12345)));
    strictEqual(seen.size, 24);
  });

  test("a different game seed gives a different colour order", () => {
    const a = Array.from({length: 24}, (_, i) => key(paletteColor(i, 1)));
    const b = Array.from({length: 24}, (_, i) => key(paletteColor(i, 2)));
    ok(a.some((k, i) => k !== b[i]));
  });

  test("colours are not fixed to a slot: slot 0 changes across seeds", () => {
    const first = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) first.add(key(paletteColor(0, seed)));
    ok(first.size > 1);
  });

  test("players and bots use the same range (saturation and lightness)", () => {
    for (let i = 0; i < 30; i++) {
      const c = paletteColor(i, 77);
      ok(c.s >= 0.7 && c.s <= 0.75, `saturation ${c.s}`);
      ok(c.l >= 0.45 && c.l <= 0.61, `lightness ${c.l}`);
      notStrictEqual(c.h, undefined);
    }
  });
});
