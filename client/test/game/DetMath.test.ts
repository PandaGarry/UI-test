import {describe, test} from "node:test";
import {ok, strictEqual} from "node:assert";
import * as DetMath from "../../src/util/DetMath";

// Accuracy against Math.* (the reference implementation of the current engine). Tolerance is far below
// anything that can change a gameplay threshold.
function near(actual: number, expected: number, relTol: number, absTol = 1e-12): boolean {
	return Math.abs(actual - expected) <= Math.max(absTol, Math.abs(expected) * relTol);
}

function grid(from: number, to: number, steps: number): number[] {
	const out: number[] = [];
	for (let i = 0; i <= steps; i++) out.push(from + (to - from) * i / steps);
	return out;
}

describe("DetMath", () => {
	test("exp matches Math.exp over the simulation range", () => {
		for (const x of grid(-40, 40, 800)) ok(near(DetMath.exp(x), Math.exp(x), 1e-13), `exp(${x})`);
	});

	test("log matches Math.log over positive values", () => {
		for (const x of [1e-6, 0.001, 0.5, 1, 1.5, 2, 3, 10, 100, 1e4, 1e6, 6e6]) ok(near(DetMath.log(x), Math.log(x), 1e-13), `log(${x})`);
	});

	test("pow matches Math.pow for integer and fractional exponents", () => {
		for (const x of [0.5, 1, 2, 3, 17, 250, 1000]) {
			for (const y of [-1, 0.5, 1, 2, 3, 0.75, 1.3]) ok(near(DetMath.pow(x, y), Math.pow(x, y), 1e-12), `pow(${x},${y})`);
		}
		strictEqual(DetMath.pow(0, 2), 0);
		strictEqual(DetMath.pow(7, 0), 1);
	});

	test("sin and cos match Math over several turns", () => {
		for (const x of grid(-20, 20, 1000)) {
			ok(near(DetMath.sin(x), Math.sin(x), 1e-12, 1e-12), `sin(${x})`);
			ok(near(DetMath.cos(x), Math.cos(x), 1e-12, 1e-12), `cos(${x})`);
		}
	});

	test("acos matches Math.acos and clamps values slightly outside [-1, 1]", () => {
		for (const x of grid(-1, 1, 400)) ok(near(DetMath.acos(x), Math.acos(x), 1e-12, 1e-12), `acos(${x})`);
		strictEqual(DetMath.acos(1.0000000000000002), 0);
		strictEqual(DetMath.acos(-1.0000000000000002), Math.PI);
	});

	test("special values follow Math", () => {
		strictEqual(DetMath.log(0), -Infinity);
		strictEqual(DetMath.exp(-Infinity), 0);
		ok(Number.isNaN(DetMath.log(-1)));
		ok(Number.isNaN(DetMath.acos(NaN)));
	});
});
