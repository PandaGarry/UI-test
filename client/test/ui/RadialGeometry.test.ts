import {describe, test} from "node:test";
import {deepEqual, equal, ok} from "node:assert";
import {clampMenuPosition, iconPosition, radiiForLevel, sectorAngles, sectorPath} from "../../src/ui/radial/RadialGeometry";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe("RadialGeometry: rings", () => {
	test("root ring is 40–95, a submenu ring is 75–140 (reference values)", () => {
		deepEqual(radiiForLevel(0), {inner: 40, outer: 95});
		deepEqual(radiiForLevel(1), {inner: 75, outer: 140});
		deepEqual(radiiForLevel(2), {inner: 75, outer: 140});
	});
});

describe("RadialGeometry: sectors and icons", () => {
	test("element 0 is centred on the top, the next ones go clockwise", () => {
		const first = sectorAngles(0, 4);
		ok(near((first.start + first.end) / 2, -Math.PI / 2));
		const second = sectorAngles(1, 4);
		ok(near((second.start + second.end) / 2, 0), "second element is on the right");
		ok(near(second.end - second.start, Math.PI / 2), "four elements make quarters");
	});

	test("icons sit on the middle of the ring, on the sector axis", () => {
		const top = iconPosition(0, 4, 40, 95);
		ok(near(top.x, 0));
		ok(near(top.y, -67.5));
		const right = iconPosition(1, 4, 40, 95);
		ok(near(right.x, 67.5));
		ok(near(right.y, 0));
	});

	test("sector path is closed and stays inside its square", () => {
		const path = sectorPath(0, 4, 40, 95);
		ok(path.startsWith("M") && path.endsWith("Z"));
		const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
		for (const n of numbers) ok(n >= -0.001 && n <= 190.001, `coordinate ${n} inside 2·outer`);
	});
});

describe("RadialGeometry: position on screen", () => {
	test("a tap in the middle of a large window is kept", () => {
		deepEqual(clampMenuPosition(400, 300, 95, 800, 600), {x: 400, y: 300});
	});

	test("the menu stays inside the window, with the margin max(outer, centre) + 10", () => {
		// margin for the root ring: 95 + 10 = 105
		deepEqual(clampMenuPosition(10, 10, 95, 800, 600), {x: 105, y: 105});
		deepEqual(clampMenuPosition(790, 590, 95, 800, 600), {x: 695, y: 495});
	});

	test("a submenu uses its larger outer radius for the margin", () => {
		// margin for a submenu: 140 + 10 = 150
		deepEqual(clampMenuPosition(10, 10, 140, 800, 600), {x: 150, y: 150});
	});

	test("an axis where the menu does not fit is centred", () => {
		// root margin 105: 2 × 105 = 210 > 200 → horizontal centre
		equal(clampMenuPosition(5, 300, 95, 200, 600).x, 100);
		equal(clampMenuPosition(195, 300, 95, 200, 600).x, 100);
	});
});
