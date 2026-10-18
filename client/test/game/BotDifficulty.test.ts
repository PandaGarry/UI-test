import {describe, it} from "node:test";
import {strictEqual, ok} from "node:assert";
import {BalanceConfig} from "@frontline/core/game/BalanceConfig";

// The lobby difficulty goes from easy to impossible. The bot table must only get stronger in that order
// (more parallel attacks, fewer skipped attacks on humans); the reference uses the same ordering (AiAttackBehavior).
const order = ["easy", "medium", "hard", "impossible"] as const;

describe("bot difficulty table", () => {
	it("parallel attacks do not decrease with difficulty", () => {
		for (let i = 1; i < order.length; i++) {
			ok(BalanceConfig.botDifficulty[order[i]].maxParallelAttacks >= BalanceConfig.botDifficulty[order[i - 1]].maxParallelAttacks);
		}
	});

	it("skipped attacks on humans do not increase with difficulty", () => {
		for (let i = 1; i < order.length; i++) {
			ok(BalanceConfig.botDifficulty[order[i]].humanAttackSkipPercent <= BalanceConfig.botDifficulty[order[i - 1]].humanAttackSkipPercent);
		}
	});

	it("values match the reference switches that are ported", () => {
		strictEqual(BalanceConfig.botDifficulty.easy.maxParallelAttacks, 1);
		strictEqual(BalanceConfig.botDifficulty.hard.maxParallelAttacks, 3);
		strictEqual(BalanceConfig.botDifficulty.impossible.maxParallelAttacks, 100);
		strictEqual(BalanceConfig.botDifficulty.easy.humanAttackSkipPercent, 75);
		strictEqual(BalanceConfig.botDifficulty.medium.humanAttackSkipPercent, 25);
		strictEqual(BalanceConfig.botDifficulty.hard.humanAttackSkipPercent, 0);
	});

	it("the default lobby difficulty is one of the table keys", () => {
		ok(BalanceConfig.defaultNationDifficulty in BalanceConfig.botDifficulty);
	});
});
