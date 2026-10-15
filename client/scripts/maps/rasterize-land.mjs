// Rasterizes Natural Earth land (public domain, via npm world-atlas) to a land/water grid.
import {readFileSync, writeFileSync} from "fs";
import {createRequire} from "module";
import zlib from "zlib";
const require = createRequire(import.meta.url);
const topo = require("topojson-client");
const atlas = JSON.parse(readFileSync(new URL(`../../node_modules/world-atlas/${process.env.LAND || "land-50m"}.json`, import.meta.url)));
const land = topo.feature(atlas, atlas.objects.land);
// Collect rings as [lon, lat] arrays.
const rings = [];
for (const f of land.features) {
	const g = f.geometry;
	const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
	for (const poly of polys) for (const ring of poly) rings.push(ring);
}

export function rasterize({W, H, lon0, lon1, lat0, lat1}) {
	const grid = new Uint8Array(W * H);
	const sx = W / (lon1 - lon0), sy = H / (lat1 - lat0);
	// edges in pixel space (optional Mercator projection of latitude)
	const merc = d => (process.env.PROJ === "merc" ? Math.log(Math.tan(Math.PI / 4 + (d * Math.PI) / 360)) * (180 / Math.PI) : d);
	const edges = [];
	for (const ring of rings) {
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const [xa, ya] = ring[j], [xb, yb] = ring[i];
			const ax = (xa - lon0) * sx, ay = (lat1 - merc(ya)) * sy;
			const bx = (xb - lon0) * sx, by = (lat1 - merc(yb)) * sy;
			if (ay === by) continue;
			if (Math.max(ay, by) < 0 || Math.min(ay, by) > H) continue;
			if (Math.max(ax, bx) < 0 && Math.min(ax, bx) < 0) continue; // fully left: still counts for parity below? keep simple
			edges.push([ax, ay, bx, by]);
		}
	}
	// scanline with even-odd rule at pixel centres
	const xs = [];
	for (let y = 0; y < H; y++) {
		const cy = y + 0.5;
		xs.length = 0;
		for (const [ax, ay, bx, by] of edges) {
			if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
				xs.push(ax + ((cy - ay) * (bx - ax)) / (by - ay));
			}
		}
		xs.sort((a, b) => a - b);
		for (let k = 0; k + 1 < xs.length; k += 2) {
			const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
			for (let x = x0; x <= x1; x++) grid[y * W + x] = 1;
		}
	}
	let count = 0;
	for (let i = 0; i < grid.length; i++) count += grid[i];
	return {grid, count};
}

export function writePNG(path, W, H, grid, water = [27, 58, 90], landRGB = [200, 185, 138]) {
	const raw = Buffer.alloc((W * 3 + 1) * H);
	for (let y = 0; y < H; y++) {
		raw[y * (W * 3 + 1)] = 0;
		for (let x = 0; x < W; x++) {
			const c = grid[y * W + x] ? landRGB : water;
			const o = y * (W * 3 + 1) + 1 + x * 3;
			raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
		}
	}
	const crcTable = new Uint32Array(256).map((_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
	const chunk = (type, data) => {
		const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type), data]);
		const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
		return Buffer.concat([len, td, c]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
	const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
	writeFileSync(path, png);
}

// CLI: node raster.mjs <name> W H lon0 lon1 lat0 lat1 out.png
if (process.argv[2]) {
	const [, , name, W, H, lon0, lon1, lat0, lat1, out] = process.argv;
	const r = rasterize({W: +W, H: +H, lon0: +lon0, lon1: +lon1, lat0: +lat0, lat1: +lat1});
	console.log(name, "land", r.count, "of", W * H, (r.count / (W * H) * 100).toFixed(1) + "%");
	if (out) writePNG(out, +W, +H, r.grid);
}
