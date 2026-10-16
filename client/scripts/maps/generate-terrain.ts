// CLI: node --import tsx scripts/maps/generate-terrain.ts --seed 1 --name T1 [--w 2000 --h 1000] [--out build/pilot]
// Writes <name>.F.bin (foundation bytes), <name>.preview.png (colour by class), <name>.stats.json.
import {createHash} from "crypto";
import {deflateSync} from "zlib";
import {mkdirSync, writeFileSync} from "fs";
import {join} from "path";
import {DEFAULT_TERRAIN_PARAMS, generateTerrain} from "./lib/terrain-gen";
import {decodeFoundationByte} from "@frontline/core/map/foundation/Foundation";
import {encodeGrayPNG} from "./lib/png-io";

function arg(name: string, def: string): string {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : def;
}

const seed = Number(arg("seed", "1")) >>> 0;
const name = arg("name", `Terrain${seed}`);
const width = Number(arg("w", "2000"));
const height = Number(arg("h", "1000"));
const out = arg("out", join(__dirname, "..", "..", "build", "pilot"));

const t0 = Date.now();
const {foundation, stats} = generateTerrain({...DEFAULT_TERRAIN_PARAMS, width, height, seed});
const ms = Date.now() - t0;

mkdirSync(out, {recursive: true});
writeFileSync(join(out, `${name}.F.bin`), foundation);
// Map source: 8-bit grayscale PNG, one foundation byte per pixel (lossless, editable).
writeFileSync(join(out, `${name}.source.png`), encodeGrayPNG(width, height, foundation));

// preview colours: water, plains/hills/mountains, shore darker
const colour = (b: number): [number, number, number] => {
	const d = decodeFoundationByte(b);
	if (d.impassable) return [60, 60, 60];
	if (!d.land) return d.ocean ? [70, 130, 190] : [120, 170, 215];
	const shade: [number, number, number] = d.terrain === "plains" ? [190, 205, 140]
		: d.terrain === "hills" ? [160, 160, 110] : [225, 225, 210];
	return d.shore ? [shade[0] - 25, shade[1] - 25, shade[2] - 25] : shade;
};
const rowLen = width * 3 + 1;
const raw = Buffer.alloc(rowLen * height);
for (let y = 0; y < height; y++) {
	raw[y * rowLen] = 0;
	for (let x = 0; x < width; x++) {
		const [r, g, bl] = colour(foundation[y * width + x]);
		const o = y * rowLen + 1 + x * 3;
		raw[o] = r; raw[o + 1] = g; raw[o + 2] = bl;
	}
}
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	crcTable[n] = c >>> 0;
}
const crc32 = (buf: Buffer) => {
	let c = 0xffffffff;
	for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 2;
writeFileSync(join(out, `${name}.preview.png`), Buffer.concat([
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
	chunk("IHDR", ihdr),
	chunk("IDAT", deflateSync(raw, {level: 6})),
	chunk("IEND", Buffer.alloc(0)),
]));

const sha = createHash("sha256").update(foundation).digest("hex");
const rounded = Object.fromEntries(Object.entries(stats).map(([k, v]) =>
	[k, typeof v === "number" && v < 1 && v > 0 ? +v.toFixed(4) : v]));
const report = {name, seed, width, height, ms, sha256: sha, ...rounded};
writeFileSync(join(out, `${name}.stats.json`), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
