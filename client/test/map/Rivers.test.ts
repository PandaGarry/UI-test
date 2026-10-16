import {describe, test} from "node:test";
import {equal, deepEqual, ok} from "node:assert";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fourConnect} from "../../scripts/maps/lib/rivers";
import {decodeGrayPNG} from "../../scripts/maps/lib/png-io";
import {buildFoundation, CELL_LAND, CELL_WATER, decodeFoundationByte} from "@frontline/core/map/foundation/Foundation";

describe("fourConnect", () => {
	test("a diagonal step gets one orthogonal bridge, so the river is 4-connected", () => {
		// 3x3, diagonal from (0,0) to (1,1)
		const w = 3, h = 3;
		const px = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 0]);
		const out = fourConnect(w, h, px);
		equal(out[0], 1);
		equal(out[4], 1);
		equal(out[1] + out[3] >= 1, true, "one of the orthogonal cells is added");
	});

	test("straight rivers are unchanged", () => {
		const w = 3, h = 1;
		deepEqual(Array.from(fourConnect(w, h, Uint8Array.from([255, 255, 0]))), [1, 1, 0]);
	});
});

describe("protectWater in buildFoundation", () => {
	// 9x5 land with a 3-cell inland water channel in the middle (inside land, not touching the border).
	const w = 9, h = 5;
	const kinds = new Uint8Array(w * h).fill(CELL_LAND);
	const elev = new Uint8Array(w * h).fill(5);
	const channel = [22, 23, 24];
	for (const i of channel) kinds[i] = CELL_WATER;

	test("without protection a small inland water body becomes land (lake rule)", () => {
		const out = buildFoundation(w, h, kinds, elev, {minIslandSize: 1, minLakeSize: 200});
		equal(decodeFoundationByte(out[23]).land, true);
	});

	test("with protectWater the river cells stay water and are not removed", () => {
		const protectWater = new Uint8Array(w * h);
		for (const i of channel) protectWater[i] = 1;
		const out = buildFoundation(w, h, kinds, elev, {minIslandSize: 1, minLakeSize: 200, protectWater});
		for (const i of channel) equal(decodeFoundationByte(out[i]).land, false, `river cell ${i} must stay water`);
	});
});

describe("shipped rivers are water in the foundation", () => {
	for (const name of ["World", "Europe", "Africa"]) {
		test(`${name}: every river cell is water (not conquerable land), so land cannot cross it`, () => {
			const root = join(__dirname, "..", "..");
			const foundation = decodeGrayPNG(readFileSync(join(root, "resources", "maps", `${name}.png`)));
			const river = decodeGrayPNG(readFileSync(join(root, "resources", "maps", `${name}.rivers.png`)));
			equal(river.width, foundation.width);
			equal(river.height, foundation.height);
			let riverCells = 0, landOnRiver = 0;
			for (let i = 0; i < river.pixels.length; i++) {
				if (!river.pixels[i]) continue;
				riverCells++;
				if (decodeFoundationByte(foundation.pixels[i]).land) landOnRiver++;
			}
			ok(riverCells > 0);
			equal(landOnRiver, 0, `${name}: river cells on land`);
		});
	}
});
