import {describe, test} from "node:test";
import {equal} from "node:assert";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {decodeGrayPNG} from "../../scripts/maps/lib/png-io";
import {decodeFoundationByte} from "@frontline/core/map/foundation/Foundation";

// Coast cleanliness of the shipped foundation (resources/maps/<Name>.png): no 1-cell tips and no 1-cell notches.
// Tip = land cell with <=2 land neighbours of 8. Notch = water cell with >=6 land neighbours of 8.
// Decision (owner, 2026-10-16): river channels (resources/maps/<Name>.rivers.png) are exempt. A 1-cell river is a
// channel by nature (6 land neighbours), and its banks are the same channel. Only the sea coast is tested.
const root = join(__dirname, "..", "..");

function coastCounts(name: string): {tips: number; notches: number; width: number; height: number} {
	const img = decodeGrayPNG(readFileSync(join(root, "resources", "maps", `${name}.png`)));
	const {width: w, height: h, pixels} = img;
	const river = decodeGrayPNG(readFileSync(join(root, "resources", "maps", `${name}.rivers.png`))).pixels;
	const land = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) land[i] = decodeFoundationByte(pixels[i]).land ? 1 : 0;
	let tips = 0, notches = 0;
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		// Skip river cells and their 8-neighbours (the banks of the channel).
		let inRiver = false;
		for (let dy = -1; dy <= 1 && !inRiver; dy++) for (let dx = -1; dx <= 1; dx++) {
			const xx = x + dx, yy = y + dy;
			if (xx >= 0 && yy >= 0 && xx < w && yy < h && river[yy * w + xx]) { inRiver = true; break; }
		}
		if (inRiver) continue;
		let n = 0;
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
			if (dx === 0 && dy === 0) continue;
			const xx = x + dx, yy = y + dy;
			if (xx >= 0 && yy >= 0 && xx < w && yy < h) n += land[yy * w + xx];
		}
		const i = y * w + x;
		if (land[i] && n <= 2) tips++;
		else if (!land[i] && n >= 6) notches++;
	}
	return {tips, notches, width: w, height: h};
}

describe("shipped foundation coastline", () => {
	for (const name of ["World", "Europe", "Africa"]) {
		test(`${name}: no 1-cell tips or notches`, () => {
			const c = coastCounts(name);
			equal(c.tips, 0, `${name}: tips`);
			equal(c.notches, 0, `${name}: notches`);
		});
	}
});
