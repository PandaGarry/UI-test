// Step 2 of the real-Earth pipeline: kinds + elevation (from export-earth.py) -> foundation -> PNG source.
// Usage: node --import tsx scripts/maps/import-earth.ts World Europe
// Reads build/earth/<Name>.{kinds,elev}.bin, writes build/earth/<Name>.F.bin, <Name>.source.png, <Name>.stats.json.
import {createHash} from "crypto";
import {readFileSync, writeFileSync} from "fs";
import {join} from "path";
import {buildFoundation, CELL_LAND, CELL_WATER} from "../../../packages/core/src/map/foundation/Foundation";
import {encodeGrayPNG, decodeGrayPNG} from "./lib/png-io";
import {measure} from "./lib/terrain-gen";
import {smoothLandMask} from "./lib/terrain-gen";
import {rankRelief, smoothOverLand, removeIsolatedRelief} from "./lib/relief";
import {fourConnect} from "./lib/rivers";
import {decodeFoundationByte} from "../../../packages/core/src/map/foundation/Foundation";

// Per-region parameters (shares, island/lake thresholds, relief smoothing) come from regions.json.
const REGIONS = JSON.parse(readFileSync(join(__dirname, "regions.json"), "utf8")).regions as Record<string, {
	reliefShare: {plains: number; hills: number};
	minIslandSize: number;
	minLakeSize: number;
	reliefSmoothRadius: number;
}>;

const dir = join(__dirname, "..", "..", "build", "earth");
const names = process.argv.slice(2);
if (names.length === 0) throw new Error("usage: import-earth.ts <Name> [...]");

for (const name of names) {
	const region = REGIONS[name];
	if (!region) throw new Error(`unknown region "${name}": add it to scripts/maps/regions.json`);
	const meta = JSON.parse(readFileSync(join(dir, `${name}.meta.json`), "utf8")) as {width: number; height: number};
	const {width, height} = meta;
	const kindsRaw = readFileSync(join(dir, `${name}.kinds.bin`));
	const elevRaw = readFileSync(join(dir, `${name}.elev.bin`));
	const n = width * height;
	if (kindsRaw.length !== n || elevRaw.length !== n) throw new Error(`${name}: size mismatch`);

	// Rivers (Natural Earth, scripts/maps/rivers.py) are WATER in F: they block land expansion and carry boats.
	// They are locked (smoothing must not erase them) and made 4-connected, because the game moves in 4 directions.
	const riverMask = fourConnect(width, height, decodeGrayPNG(readFileSync(join(dir, `${name}.rivers.png`))).pixels);
	const kinds = new Uint8Array(n);
	for (let i = 0; i < n; i++) kinds[i] = kindsRaw[i] && !riverMask[i] ? CELL_LAND : CELL_WATER;
	const elevation = new Uint8Array(elevRaw);

	const t0 = Date.now();
	const options = {
		minIslandSize: region.minIslandSize,
		minLakeSize: region.minLakeSize,
		protectWater: riverMask, // rivers are channels, never removed as small lakes
	};
	// Coastline cleaning to a fixed point (no 1-cell tips, no 1-cell notches): smoothLandMask rule.
	// Land with <=2 land neighbours (of 8) becomes water; water with >=6 land neighbours becomes land.
	const smoothToFixpoint = (src: Uint8Array): Uint8Array => {
		let cur = src;
		for (let pass = 0; pass < 50; pass++) {
			const next = smoothLandMask(width, height, cur);
			for (let i = 0; i < n; i++) if (riverMask[i]) next[i] = 0;
			let changed = false;
			for (let i = 0; i < n; i++) if (next[i] !== cur[i]) { changed = true; break; }
			cur = next;
			if (!changed) break;
		}
		return cur;
	};
	const toKinds = (mask: Uint8Array): Uint8Array => Uint8Array.from(mask, v => (v ? CELL_LAND : CELL_WATER));
	const clean = smoothToFixpoint(Uint8Array.from(kinds, k => (k === CELL_LAND ? 1 : 0)));
	// Pass 1: remove small islands and lakes (project rules).
	const pass1 = buildFoundation(width, height, toKinds(clean), elevation, options);
	// Pass 2: removing islands/lakes can leave new notches, so clean again, then relief by rank on the final land.
	const finalMask = smoothToFixpoint(Uint8Array.from(pass1, v => (decodeFoundationByte(v).land ? 1 : 0)));
	const finalKinds = toKinds(finalMask);
	// Relief ranks the SMOOTHED elevation over land (coherent ranges, no salt-and-pepper); shares are exact.
	const smoothed = smoothOverLand(width, height, finalKinds, elevation, region.reliefSmoothRadius);
	const relief = rankRelief(finalKinds, smoothed, region.reliefShare.plains, region.reliefShare.hills);
	// Isolated relief cells (decision A, owner-approved): class of majority neighbours, repeated until stable.
	const isolated = removeIsolatedRelief(width, height, finalKinds, relief);
	const foundation = buildFoundation(width, height, finalKinds, relief, options);
	const ms = Date.now() - t0;

	writeFileSync(join(dir, `${name}.F.bin`), foundation);
	writeFileSync(join(dir, `${name}.source.png`), encodeGrayPNG(width, height, foundation));
	const stats = measure(width, height, foundation);
	const sha = createHash("sha256").update(foundation).digest("hex");
	const report = {name, width, height, ms, sha256: sha, isolatedFixed: isolated.changed, isolatedPasses: isolated.passes, isolatedRemaining: isolated.remaining, ...stats};
	writeFileSync(join(dir, `${name}.stats.json`), JSON.stringify(report, null, 2) + "\n");
	console.log(JSON.stringify({
		name,
		landShare: +stats.landShare.toFixed(4),
		plains: +stats.plainsOfLand.toFixed(3),
		hills: +stats.hillsOfLand.toFixed(3),
		mountains: +stats.mountainsOfLand.toFixed(3),
		shore: +stats.shoreOfLand.toFixed(4),
		bodies100: stats.landBodiesOver100,
		largest: +stats.largestBodyShareOfLand.toFixed(4),
		lakes: stats.lakes,
		spikes: stats.spikes, holes: stats.holes, pits: stats.pits,
		ms,
	}));
}
