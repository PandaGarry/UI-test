import {describe, test} from "node:test";
import {strictEqual, ok} from "node:assert";
import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

// Step 4: the same seed and inputs must give the same gameplay state in independent processes.
// The golden hash (test/game/determinism.golden) changes only on purpose: when gameplay balance changes,
// update it in the same commit and say why in the commit message.
const root = join(__dirname, "..", "..");
const cache = join(root, "build", "cache", "Europe.mapcache");

function run(): string {
	const out = execFileSync("npx", ["tsx", "scripts/determinism-check.ts", "--map", "Europe", "--bots", "30", "--ticks", "400", "--seed", "12345"], {
		cwd: root,
		encoding: "utf8",
	});
	const m = out.match(/STATE_HASH=([0-9a-f]{8})/);
	ok(m, `no STATE_HASH in output: ${out}`);
	return m[1];
}

describe("Determinism", () => {
	test("same seed gives the same state hash in independent processes and matches the golden value",
		{skip: existsSync(cache) ? false : "build/cache/Europe.mapcache missing: run npm run gen-maps"},
		() => {
			const first = run();
			const second = run();
			strictEqual(second, first, "two processes with the same seed produced different states");
			strictEqual(first, readFileSync(join(__dirname, "determinism.golden"), "utf8").trim(), "state hash changed: gameplay behaviour differs from the golden value");
		});
});
