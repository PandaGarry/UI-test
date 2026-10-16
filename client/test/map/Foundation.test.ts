import {describe, test} from "node:test";
import {equal, deepEqual, ok, throws} from "node:assert";
import {
	buildFoundation,
	CELL_IMPASSABLE,
	CELL_LAND,
	CELL_WATER,
	decodeFoundationByte,
	IMPASSABLE_BYTE,
	LAND_BIT,
	OCEAN_BIT,
	packFoundationByte,
	SHORE_BIT,
} from "@frontline/core/map/foundation/Foundation";

const OPTS = {minIslandSize: 3, minLakeSize: 3};

/** Builds a grid from rows of characters: '#' land, '.' water, 'X' impassable. Elevation 5 for land. */
function grid(rows: string[]) {
	const height = rows.length;
	const width = rows[0].length;
	const kinds = new Uint8Array(width * height);
	const elev = new Uint8Array(width * height);
	rows.forEach((row, y) => [...row].forEach((c, x) => {
		const i = y * width + x;
		kinds[i] = c === "#" ? CELL_LAND : c === "X" ? CELL_IMPASSABLE : CELL_WATER;
		elev[i] = c === "#" ? 5 : 0;
	}));
	return {width, height, kinds, elev};
}

describe("Foundation byte", () => {
	test("pack and decode round-trip for every land/shore/ocean/magnitude combination", () => {
		for (const land of [false, true]) {
			for (const shore of [false, true]) {
				for (const ocean of [false, true]) {
					for (let m = 0; m <= (land ? 30 : 31); m++) {
						const b = packFoundationByte(land, shore, ocean, m);
						const d = decodeFoundationByte(b);
						equal(d.land, land);
						equal(d.shore, shore);
						equal(d.ocean, land ? false : ocean);
						equal(d.magnitude, m);
						equal(d.impassable, false);
					}
				}
			}
		}
	});

	test("land magnitude is clamped to 0-30 (31 is the impassable value); water to 0-31", () => {
		equal(packFoundationByte(true, false, false, 99) & 0x1f, 30);
		equal(packFoundationByte(false, false, false, 99) & 0x1f, 31);
		equal(packFoundationByte(true, false, false, -4) & 0x1f, 0);
	});

	test("elevation classes follow the reference thresholds (plains 0-9, hills 10-19, mountains 20-31)", () => {
		equal(decodeFoundationByte(packFoundationByte(true, false, false, 0)).terrain, "plains");
		equal(decodeFoundationByte(packFoundationByte(true, false, false, 9)).terrain, "plains");
		equal(decodeFoundationByte(packFoundationByte(true, false, false, 10)).terrain, "hills");
		equal(decodeFoundationByte(packFoundationByte(true, false, false, 19)).terrain, "hills");
		equal(decodeFoundationByte(packFoundationByte(true, false, false, 20)).terrain, "mountains");
		equal(decodeFoundationByte(packFoundationByte(true, false, false, 30)).terrain, "mountains");
		equal(decodeFoundationByte(packFoundationByte(true, false, false, 31)).impassable, false, "land never becomes impassable");
	});

	test("impassable is one fixed byte, not land, not shore, not ocean", () => {
		equal(IMPASSABLE_BYTE, 0b1001_1111);
		const d = decodeFoundationByte(IMPASSABLE_BYTE);
		equal(d.impassable, true);
		equal(d.terrain, "impassable");
		equal(d.shore, false);
		equal(d.ocean, false);
	});
});

describe("buildFoundation", () => {
	test("rejects mismatched array sizes", () => {
		throws(() => buildFoundation(2, 2, new Uint8Array(3), new Uint8Array(4), OPTS));
	});

	test("removes land bodies smaller than minIslandSize, keeps larger ones", () => {
		const g = grid([
			"........",
			".#......",
			"........",
			"....###.",
			"....###.",
			"........",
		]);
		const out = buildFoundation(g.width, g.height, g.kinds, g.elev, {minIslandSize: 2, minLakeSize: 0});
		equal(decodeFoundationByte(out[1 * 8 + 1]).land, false, "1-tile island is below 2 and removed");
		const small = grid([
			"........",
			".#......",
			"........",
			"....###.",
			"....###.",
			"........",
		]);
		const out2 = buildFoundation(small.width, small.height, small.kinds, small.elev, {minIslandSize: 3, minLakeSize: 0});
		equal(decodeFoundationByte(out2[1 * 8 + 1]).land, false, "1-tile island removed at minIslandSize 3");
		equal(decodeFoundationByte(out2[3 * 8 + 4]).land, true, "6-tile island kept");
	});

	test("shore flags sit on both sides of a land/water boundary", () => {
		const g = grid([
			".....",
			".###.",
			".###.",
			".###.",
			".....",
		]);
		const out = buildFoundation(g.width, g.height, g.kinds, g.elev, OPTS);
		equal(decodeFoundationByte(out[1 * 5 + 1]).shore, true, "corner land touches water");
		equal(decodeFoundationByte(out[2 * 5 + 2]).shore, false, "centre land is interior");
		equal(decodeFoundationByte(out[0 * 5 + 2]).shore, true, "water touching land is shore");
		equal(decodeFoundationByte(out[0 * 5 + 0]).shore, false, "far water is not shore");
	});

	test("water depth = ceil(distance to land / 2)", () => {
		const g = grid([
			".........",
			".........",
			"....##...",
			"....##...",
			".........",
		]);
		const out = buildFoundation(g.width, g.height, g.kinds, g.elev, OPTS);
		equal(decodeFoundationByte(out[1 * 9 + 4]).magnitude, 1, "distance 1 -> depth 1");
		equal(decodeFoundationByte(out[0 * 9 + 4]).magnitude, 1, "distance 2 -> depth 1");
		equal(decodeFoundationByte(out[4 * 9 + 4]).magnitude, 1, "distance 2 below -> depth 1");
		equal(decodeFoundationByte(out[0 * 9 + 0]).magnitude, 3, "distance 6 (4+2 steps) -> depth 3");
	});

	test("ocean = water connected to the border; an enclosed lake is not ocean", () => {
		const g = grid([
			"..........",
			".#########",
			".#.......#",
			".#.......#",
			".#########",
			"..........",
		]);
		const out = buildFoundation(g.width, g.height, g.kinds, g.elev, {minIslandSize: 0, minLakeSize: 0});
		ok(decodeFoundationByte(out[0]).ocean, "border water is ocean");
		ok(!decodeFoundationByte(out[2 * 10 + 4]).ocean, "enclosed water is not ocean");
	});

	test("small lakes become flat land; large lakes and the ocean are kept", () => {
		const g = grid([
			"##########",
			"##.#######",
			"##########",
			"##########",
			"##########",
		]);
		const out = buildFoundation(g.width, g.height, g.kinds, g.elev, {minIslandSize: 0, minLakeSize: 2});
		equal(decodeFoundationByte(out[1 * 10 + 2]).land, true, "single water cell inside land (< 2) is filled");
		const big = grid([
			"##########",
			"#........#",
			"#........#",
			"#........#",
			"##########",
		]);
		const out2 = buildFoundation(big.width, big.height, big.kinds, big.elev, {minIslandSize: 0, minLakeSize: 2});
		equal(decodeFoundationByte(out2[2 * 10 + 4]).land, false, "large enclosed lake is kept as water");
	});

	test("water next to impassable terrain is deepest (magnitude 31)", () => {
		const g = grid([
			".....",
			".XXX.",
			".....",
		]);
		const out = buildFoundation(g.width, g.height, g.kinds, g.elev, OPTS);
		equal(decodeFoundationByte(out[0 * 5 + 2]).magnitude, 31);
		equal(out[1 * 5 + 1], IMPASSABLE_BYTE);
	});

	test("land and water bits are exactly as documented", () => {
		const g = grid(["#.", ".."]);
		const out = buildFoundation(g.width, g.height, g.kinds, g.elev, {minIslandSize: 0, minLakeSize: 0});
		ok((out[0] & LAND_BIT) !== 0);
		ok((out[1] & LAND_BIT) === 0);
		ok((out[1] & OCEAN_BIT) !== 0);
		ok((out[0] & SHORE_BIT) !== 0);
	});

	test("is deterministic: the same input gives the same bytes", () => {
		const g = grid([
			"..........",
			"...###....",
			"..#####...",
			"...###..#.",
			"........#.",
		]);
		const a = buildFoundation(g.width, g.height, g.kinds, g.elev, OPTS);
		const b = buildFoundation(g.width, g.height, g.kinds, g.elev, OPTS);
		deepEqual(Array.from(a), Array.from(b));
	});

	test("does not mutate its input arrays", () => {
		const g = grid([
			"....",
			".#..",
			"....",
		]);
		const kinds = Uint8Array.from(g.kinds);
		const elev = Uint8Array.from(g.elev);
		buildFoundation(g.width, g.height, kinds, elev, {minIslandSize: 5, minLakeSize: 0});
		deepEqual(Array.from(kinds), Array.from(g.kinds));
		deepEqual(Array.from(elev), Array.from(g.elev));
	});
});
