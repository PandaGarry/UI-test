import {describe, test} from "node:test";
import {deepEqual, equal, ok} from "node:assert";
import {encodeGrayPNG, decodeGrayPNG} from "../../scripts/maps/lib/png-io";
import {DEFAULT_TERRAIN_PARAMS, generateTerrain} from "../../scripts/maps/lib/terrain-gen";

describe("PNG map source (lossless foundation bytes)", () => {
	test("gray PNG round-trips every byte value 0-255", () => {
		const w = 16, h = 16;
		const px = new Uint8Array(w * h);
		for (let i = 0; i < px.length; i++) px[i] = i & 0xff;
		const dec = decodeGrayPNG(encodeGrayPNG(w, h, px));
		equal(dec.width, w);
		equal(dec.height, h);
		deepEqual(Array.from(dec.pixels), Array.from(px));
	});

	test("generated terrain survives PNG encode/decode bit-exactly", () => {
		const {foundation} = generateTerrain({...DEFAULT_TERRAIN_PARAMS, width: 240, height: 140, seed: 3});
		const png = encodeGrayPNG(240, 140, foundation);
		ok(png.length < foundation.length, "PNG is compressed");
		const dec = decodeGrayPNG(png);
		deepEqual(Array.from(dec.pixels), Array.from(foundation));
	});

	test("rejects size mismatch", () => {
		let threw = false;
		try { encodeGrayPNG(4, 4, new Uint8Array(15)); } catch { threw = true; }
		ok(threw);
	});
});
