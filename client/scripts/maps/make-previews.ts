// Colour previews for the create-lobby map cards.
// The map PNGs in resources/maps are the foundation source (one grey byte per tile), so they look grey.
// This writes resources/maps/<Name>.preview.png with the game's own colours (theme pastel: ocean, plains,
// highland, mountain). Visual only: the foundation and the game data are not touched.
// Usage: node --import tsx scripts/maps/make-previews.ts World Europe Africa
import {readFileSync, writeFileSync} from "fs";
import {join} from "path";
import {deflateSync} from "zlib";
import {decodeFoundationByte, classifyLandMagnitude} from "../../../packages/core/src/map/foundation/Foundation";
import {decodeGrayPNG} from "./lib/png-io";

const COLORS = {
	water: [0x47, 0x85, 0xb5],
	plains: [0xbe, 0xdc, 0x8a],
	hills: [0xdc, 0xcb, 0x9e],
	mountains: [0xe6, 0xe6, 0xe6],
} as const;

function crc32(buf: Buffer): number {
	let c = ~0;
	for (const byte of buf) {
		c ^= byte;
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, "ascii");
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
	return Buffer.concat([head, data, crc]);
}

function encodeRGBPNG(width: number, height: number, rgb: Uint8Array): Buffer {
	const raw = Buffer.alloc((width * 3 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 3 + 1)] = 0; // filter: none
		Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type RGB
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

const dir = join(__dirname, "..", "..", "resources", "maps");
const names = process.argv.slice(2);
if (names.length === 0) throw new Error("usage: make-previews.ts <Name> [...]");
for (const name of names) {
	const src = decodeGrayPNG(readFileSync(join(dir, `${name}.png`)));
	const rgb = new Uint8Array(src.width * src.height * 3);
	for (let i = 0; i < src.pixels.length; i++) {
		const tile = decodeFoundationByte(src.pixels[i]);
		const key = tile.land ? (tile.impassable ? "mountains" : classifyLandMagnitude(tile.magnitude)) : "water";
		rgb.set(COLORS[key], i * 3);
	}
	writeFileSync(join(dir, `${name}.preview.png`), encodeRGBPNG(src.width, src.height, rgb));
	console.log(`${name}.preview.png ${src.width}x${src.height}`);
}
