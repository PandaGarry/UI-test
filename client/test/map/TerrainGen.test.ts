import {describe, test} from "node:test";
import {equal, ok, deepEqual} from "node:assert";
import {DEFAULT_TERRAIN_PARAMS, generateTerrain} from "../../scripts/maps/lib/terrain-gen";
import {decodeFoundationByte} from "@frontline/core/map/foundation/Foundation";

const SMALL = {...DEFAULT_TERRAIN_PARAMS, width: 240, height: 140};

describe("terrain generator invariants (no pits, holes, spikes)", () => {
	for (const seed of [1, 2, 5]) {
		test(`seed ${seed}: no pits, no 1-tile spikes or holes, land share on target`, () => {
			const {stats} = generateTerrain({...SMALL, seed});
			equal(stats.pits, 0, "every land tile drains to water");
			equal(stats.spikes, 0, "no 1-tile land spikes");
			equal(stats.holes, 0, "no 1-tile water holes");
			ok(Math.abs(stats.landShare - DEFAULT_TERRAIN_PARAMS.targetLand) < 0.01, `land ${stats.landShare}`);
		});

		test(`seed ${seed}: relief shares are exact`, () => {
			const {stats} = generateTerrain({...SMALL, seed});
			ok(Math.abs(stats.plainsOfLand - 0.34) < 0.01);
			ok(Math.abs(stats.hillsOfLand - 0.38) < 0.01);
		});

		test(`seed ${seed}: every land body respects minIslandSize`, () => {
			const {foundation} = generateTerrain({...SMALL, seed});
			const w = SMALL.width;
			const h = SMALL.height;
			const isLand = (i: number) => decodeFoundationByte(foundation[i]).land;
			const seen = new Uint8Array(w * h);
			for (let s = 0; s < w * h; s++) {
				if (seen[s] || !isLand(s)) continue;
				const stack = [s];
				seen[s] = 1;
				let size = 0;
				while (stack.length) {
					const t = stack.pop() as number;
					size++;
					const x = t % w;
					const y = (t - x) / w;
					const push = (u: number) => { if (!seen[u] && isLand(u)) { seen[u] = 1; stack.push(u); } };
					if (x > 0) push(t - 1);
					if (x < w - 1) push(t + 1);
					if (y > 0) push(t - w);
					if (y < h - 1) push(t + w);
				}
				ok(size >= DEFAULT_TERRAIN_PARAMS.minIslandSize, `body of ${size} tiles`);
			}
		});
	}

	test("same seed gives identical bytes; different seed differs", () => {
		const a = generateTerrain({...SMALL, seed: 9}).foundation;
		const b = generateTerrain({...SMALL, seed: 9}).foundation;
		const c = generateTerrain({...SMALL, seed: 10}).foundation;
		deepEqual(Array.from(a), Array.from(b));
		ok(Array.from(a).some((v, i) => v !== c[i]));
	});
});
