// Minimal PNG decoder (8-bit, non-interlaced, colour types 0/2/3/4/6).
// Enough for the palette-style map images in resources/maps — no native deps.
const zlib = require("zlib");

function decodePNG(buffer) {
	if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG file");
	let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
	const idat = [];
	while (offset < buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const type = buffer.toString("ascii", offset + 4, offset + 8);
		const data = buffer.subarray(offset + 8, offset + 8 + length);
		if (type === "IHDR") {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			bitDepth = data[8];
			colorType = data[9];
			if (data[12] !== 0) throw new Error("Interlaced PNGs are not supported");
		} else if (type === "IDAT") idat.push(data);
		else if (type === "IEND") break;
		offset += 12 + length;
	}
	if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
	const channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colorType];
	if (!channels) throw new Error(`Unsupported PNG colour type: ${colorType}`);
	const raw = zlib.inflateSync(Buffer.concat(idat));
	const stride = width * channels;
	const pixels = new Uint8Array(width * height * 4);
	let prev = new Uint8Array(stride);
	for (let y = 0; y < height; y++) {
		const rowStart = y * (stride + 1);
		const filter = raw[rowStart];
		const row = raw.subarray(rowStart + 1, rowStart + 1 + stride);
		const out = new Uint8Array(stride);
		for (let x = 0; x < stride; x++) {
			const a = x >= channels ? out[x - channels] : 0;
			const b = prev[x];
			const c = x >= channels ? prev[x - channels] : 0;
			let recon = row[x];
			switch (filter) {
				case 0: break;
				case 1: recon = (recon + a) & 0xff; break;
				case 2: recon = (recon + b) & 0xff; break;
				case 3: recon = (recon + ((a + b) >> 1)) & 0xff; break;
				case 4: {
					const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
					recon = (recon + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
					break;
				}
				default: throw new Error(`Unsupported PNG filter: ${filter}`);
			}
			out[x] = recon;
		}
		for (let x = 0; x < width; x++) {
			const src = x * channels, dst = (y * width + x) * 4;
			if (colorType === 2 || colorType === 6) {
				pixels[dst] = out[src]; pixels[dst + 1] = out[src + 1]; pixels[dst + 2] = out[src + 2];
				pixels[dst + 3] = colorType === 6 ? out[src + 3] : 255;
			} else if (colorType === 0 || colorType === 4) {
				pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = out[src];
				pixels[dst + 3] = colorType === 4 ? out[src + 1] : 255;
			} else { // palette indices are exposed as grey; map colours in our assets are greys anyway
				pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = out[src];
				pixels[dst + 3] = 255;
			}
		}
		prev = out;
	}
	return {width, height, data: pixels};
}

module.exports = {decodePNG};
