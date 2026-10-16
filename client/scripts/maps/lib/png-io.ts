/**
 * Lossless 8-bit grayscale PNG I/O for map sources.
 *
 * A map source is an 8-bit grayscale PNG in which every pixel is one foundation byte
 * (docs/MAP-ARCHITECTURE-2026-10-16.md, 3.2). The PNG is the editable artefact; the foundation
 * bytes are recovered from it exactly (no palette matching, no anti-aliasing loss).
 */
import {deflateSync, inflateSync} from "zlib";
import {createRequire} from "module";

const require = createRequire(import.meta.url);
// Existing minimal decoder in client/scripts (8-bit, non-interlaced, colour types 0/2/3/4/6).
const {decodePNG} = require("../../png-decode.js") as {
	decodePNG: (buf: Buffer) => {width: number; height: number; data: Uint8Array};
};

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(buf: Buffer): number {
	let c = 0xffffffff;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}

/** Encodes width*height bytes as an 8-bit grayscale PNG (color type 0, filter None). */
export function encodeGrayPNG(width: number, height: number, pixels: Uint8Array): Buffer {
	if (pixels.length !== width * height) {
		throw new Error(`encodeGrayPNG: expected ${width * height} pixels, got ${pixels.length}`);
	}
	const rowLen = width + 1;
	const raw = Buffer.alloc(rowLen * height);
	for (let y = 0; y < height; y++) {
		raw[y * rowLen] = 0; // filter type None
		raw.set(pixels.subarray(y * width, (y + 1) * width), y * rowLen + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 0; // colour type: grayscale
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace
	return Buffer.concat([
		PNG_SIGNATURE,
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw, {level: 9})),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/** Decodes a grayscale PNG back into width, height and one byte per pixel. Throws on other formats. */
export function decodeGrayPNG(buf: Buffer): {width: number; height: number; pixels: Uint8Array} {
	const img = decodePNG(buf);
	const n = img.width * img.height;
	const pixels = new Uint8Array(n);
	// decodePNG expands to RGBA; for a grayscale source all channels are equal. Verify and take R.
	for (let i = 0; i < n; i++) {
		const r = img.data[i * 4];
		if (img.data[i * 4 + 1] !== r || img.data[i * 4 + 2] !== r) {
			throw new Error("decodeGrayPNG: source is not grayscale");
		}
		pixels[i] = r;
	}
	return {width: img.width, height: img.height, pixels};
}

/** Exposed for tests of the raw container. */
export function inflateIDAT(buf: Buffer): Buffer {
	const parts: Buffer[] = [];
	let off = 8;
	while (off < buf.length) {
		const len = buf.readUInt32BE(off);
		const type = buf.toString("ascii", off + 4, off + 8);
		if (type === "IDAT") parts.push(buf.subarray(off + 8, off + 8 + len));
		off += 12 + len;
	}
	return inflateSync(Buffer.concat(parts));
}
