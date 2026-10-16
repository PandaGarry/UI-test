// Parameter sweep for the terrain generator. Reports per-config medians over several seeds
// against reference "world" stats (docs/MAP-REFERENCE-STATS-2026-10-16.jsonl).
import {DEFAULT_TERRAIN_PARAMS, generateTerrain} from "./lib/terrain-gen";

const REF = {shore: 0.0388, bodies100: 53, largest: 0.3468, land: 0.3258};
const seeds = [1, 2, 3, 4, 5, 6];
const configs: {plates: number; continentalShare: number; tipThreshold: number}[] = [];
for (const plates of [10, 12, 14]) for (const continentalShare of [0.3, 0.4]) for (const tipThreshold of [2]) {
	configs.push({plates, continentalShare, tipThreshold});
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const c of configs) {
	const rows = seeds.map(seed => generateTerrain({...DEFAULT_TERRAIN_PARAMS, ...c, width: 2000, height: 1000, seed}).stats);
	const m = {
		shore: median(rows.map(r => r.shoreOfLand)),
		bodies100: median(rows.map(r => r.landBodiesOver100)),
		largest: median(rows.map(r => r.largestBodyShareOfLand)),
		worstLargest: Math.max(...rows.map(r => r.largestBodyShareOfLand)),
		pits: rows.reduce((s, r) => s + r.pits, 0),
		holes: rows.reduce((s, r) => s + r.holes + r.spikes, 0),
	};
	const score = Math.abs(m.shore - REF.shore) / 0.01 + Math.abs(m.bodies100 - REF.bodies100) / 15 + Math.abs(m.largest - REF.largest) / 0.05;
	console.log(JSON.stringify({...c, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(4) : v])), score: +score.toFixed(2)}));
}
