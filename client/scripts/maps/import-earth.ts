// Step 2 of the real-Earth pipeline: kinds + elevation (from export-earth.py) -> foundation -> PNG source.
// Usage: node --import tsx scripts/maps/import-earth.ts World Europe
// Reads build/earth/<Name>.{kinds,elev}.bin, writes build/earth/<Name>.F.bin, <Name>.source.png, <Name>.stats.json.
import {createHash} from "crypto";
import {readFileSync, writeFileSync} from "fs";
import {join} from "path";
import {buildFoundation, CELL_LAND, CELL_WATER} from "@frontline/core/map/foundation/Foundation";
import {encodeGrayPNG} from "./lib/png-io";
import {measure} from "./lib/terrain-gen";
import {DEFAULT_TERRAIN_PARAMS} from "./lib/terrain-gen";

const dir = join(__dirname, "..", "..", "build", "earth");
const names = process.argv.slice(2);
if (names.length === 0) throw new Error("usage: import-earth.ts <Name> [...]");

for (const name of names) {
	const meta = JSON.parse(readFileSync(join(dir, `${name}.meta.json`), "utf8")) as {width: number; height: number};
	const {width, height} = meta;
	const kindsRaw = readFileSync(join(dir, `${name}.kinds.bin`));
	const elevRaw = readFileSync(join(dir, `${name}.elev.bin`));
	const n = width * height;
	if (kindsRaw.length !== n || elevRaw.length !== n) throw new Error(`${name}: size mismatch`);

	const kinds = new Uint8Array(n);
	for (let i = 0; i < n; i++) kinds[i] = kindsRaw[i] ? CELL_LAND : CELL_WATER;
	const elevation = new Uint8Array(elevRaw);

	const t0 = Date.now();
	const foundation = buildFoundation(width, height, kinds, elevation, {
		minIslandSize: DEFAULT_TERRAIN_PARAMS.minIslandSize,
		minLakeSize: DEFAULT_TERRAIN_PARAMS.minLakeSize,
	});
	const ms = Date.now() - t0;

	writeFileSync(join(dir, `${name}.F.bin`), foundation);
	writeFileSync(join(dir, `${name}.source.png`), encodeGrayPNG(width, height, foundation));
	const stats = measure(width, height, foundation);
	const sha = createHash("sha256").update(foundation).digest("hex");
	const report = {name, width, height, ms, sha256: sha, ...stats};
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
