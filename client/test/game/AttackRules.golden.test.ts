/**
 * Golden values for the attack formula (`AttackRules.attackLogic`), stage 0 of docs/REFERENCE-FULL-ANALYSIS-2026-10-18.md.
 *
 * The grid of inputs below is compared with `attackLogic.golden.json` (next to this file). A refactoring that changes
 * no number leaves the test green; a deliberate balance change shows up as a reviewable diff of the JSON.
 * To regenerate after an intended change: `GOLDEN_UPDATE=1 npm test` (then review the diff).
 */
import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {attackLogic, AttackLogicInput, Terrain} from "@frontline/core/game/attack/AttackRules";

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, "attackLogic.golden.json");

type Row = {
	terrain: number;
	defender: string;
	attackTroops: number;
	borderSize: number;
	attackerIsBot: boolean;
	attackerIsHumanOrNation: boolean;
	attackerTroopLoss: number;
	defenderTroopLoss: number;
	tickFraction: number;
};

const DEFENDERS: Record<string, AttackLogicInput["defender"]> = {
	none: null,
	humanSmall: {isBot: false, tiles: 40, troops: 300},
	humanLarge: {isBot: false, tiles: 800, troops: 9000},
	botMedium: {isBot: true, tiles: 200, troops: 1500},
};

function grid(): Row[] {
	const rows: Row[] = [];
	for (const terrain of [Terrain.Plains, Terrain.Highland, Terrain.Mountain]) {
		for (const [defName, defender] of Object.entries(DEFENDERS)) {
			for (const attackTroops of [20, 400, 4000]) {
				for (const borderSize of [1, 12]) {
					for (const attacker of [{bot: false}, {bot: true}]) {
						const input: AttackLogicInput = {
							terrain,
							attackTroops,
							attackerIsBot: attacker.bot,
							attackerIsHumanOrNation: !attacker.bot,
							attackerTiles: 150,
							defender,
							borderSize,
						};
						const r = attackLogic(input);
						rows.push({
							terrain,
							defender: defName,
							attackTroops,
							borderSize,
							attackerIsBot: attacker.bot,
							attackerIsHumanOrNation: !attacker.bot,
							attackerTroopLoss: Number(r.attackerTroopLoss.toPrecision(9)),
							defenderTroopLoss: Number(r.defenderTroopLoss.toPrecision(9)),
							tickFraction: Number(r.tickFraction.toPrecision(9)),
						});
					}
				}
			}
		}
	}
	return rows;
}

describe("attackLogic golden values", () => {
	test("the grid matches the stored values", () => {
		const rows = grid();
		if (process.env.GOLDEN_UPDATE === "1") {
			writeFileSync(goldenPath, JSON.stringify(rows, null, "\t") + "\n", "utf8");
		}
		const stored = JSON.parse(readFileSync(goldenPath, "utf8")) as Row[];
		strictEqual(rows.length, stored.length, "grid size changed");
		for (let i = 0; i < rows.length; i++) {
			strictEqual(JSON.stringify(rows[i]), JSON.stringify(stored[i]), `row ${i} changed`);
		}
	});

	test("invariants: losses and time are non-negative and finite", () => {
		for (const row of grid()) {
			ok(Number.isFinite(row.attackerTroopLoss) && row.attackerTroopLoss >= 0, JSON.stringify(row));
			ok(Number.isFinite(row.defenderTroopLoss) && row.defenderTroopLoss >= 0, JSON.stringify(row));
			ok(Number.isFinite(row.tickFraction) && row.tickFraction >= 0, JSON.stringify(row));
		}
	});

	test("defender loses its average troops per tile", () => {
		const r = attackLogic({
			terrain: Terrain.Plains,
			attackTroops: 400,
			attackerIsBot: false,
			attackerIsHumanOrNation: true,
			attackerTiles: 150,
			defender: {isBot: false, tiles: 40, troops: 300},
			borderSize: 1,
		});
		strictEqual(r.defenderTroopLoss, 300 / 40);
	});

	test("no defender losses on unclaimed land", () => {
		const r = attackLogic({
			terrain: Terrain.Plains,
			attackTroops: 400,
			attackerIsBot: false,
			attackerIsHumanOrNation: true,
			attackerTiles: 150,
			defender: null,
			borderSize: 1,
		});
		strictEqual(r.defenderTroopLoss, 0);
	});
});
