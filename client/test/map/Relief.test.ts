import {describe, test} from "node:test";
import {deepEqual, equal, ok} from "node:assert";
import {rankRelief} from "../../scripts/maps/lib/relief";
import {CELL_LAND, CELL_WATER, decodeFoundationByte} from "@frontline/core/map/foundation/Foundation";

describe("rankRelief", () => {
	test("exact class shares and monotone order of real elevation", () => {
		const n = 1000;
		const kinds = new Uint8Array(n).fill(CELL_LAND);
		const elev = new Uint8Array(n);
		for (let i = 0; i < n; i++) elev[i] = (i * 37) % 200; // scrambled real values
		const out = rankRelief(kinds, elev, 0.34, 0.38);
		let p = 0, h = 0, m = 0;
		for (let i = 0; i < n; i++) {
			const d = decodeFoundationByte(out[i] | 0x80);
			if (d.terrain === "plains") p++; else if (d.terrain === "hills") h++; else m++;
		}
		equal(p, 340);
		equal(h, 380);
		equal(m, 280);
		// higher real elevation never gets a lower class
		const rank = (i: number) => out[i];
		for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
			if (elev[a] < elev[b]) ok(rank(a) <= rank(b));
		}
	});

	test("water stays magnitude 0 and kinds are not changed", () => {
		const kinds = Uint8Array.from([CELL_WATER, CELL_LAND, CELL_LAND, CELL_WATER]);
		const elev = Uint8Array.from([9, 3, 7, 9]);
		const out = rankRelief(kinds, elev, 0.5, 0.5);
		deepEqual([out[0], out[3]], [0, 0]);
		ok(out[1] <= out[2]);
	});
});
