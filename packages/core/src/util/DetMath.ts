/**
 * Deterministic elementary functions for the simulation (step 4 of docs/ARCHITECTURE-PLAN-2026-10-16.md).
 *
 * Math.exp / log / pow / sin / cos / acos are not specified to a precision that all JavaScript engines share,
 * so their last bits can differ between browsers and between the client and the server. Here only
 * + - * / and Math.round / Math.sqrt are used: IEEE 754 requires these to be correctly rounded,
 * so the results are identical on every platform. Accuracy is checked against Math in test/game/DetMath.test.ts.
 */

const LN2 = 0.6931471805599453;
const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const TAN_PI_8 = 0.41421356237309503; // sqrt(2) - 1

/** Multiplies by 2^k exactly (powers of two are exact in binary floating point). */
function scalePow2(v: number, k: number): number {
	while (k > 0) { v *= 2; k--; }
	while (k < 0) { v /= 2; k++; }
	return v;
}

/** e^x. Range reduction x = k·ln2 + r with |r| ≤ ln2/2, then a Taylor series. */
export function exp(x: number): number {
	if (x !== x) return NaN;
	if (x > 709.78) return Infinity;
	if (x < -745) return 0;
	const k = Math.round(x / LN2);
	const r = x - k * LN2;
	let term = 1;
	let sum = 1;
	for (let i = 1; i <= 24; i++) {
		term = term * r / i;
		sum += term;
	}
	return scalePow2(sum, k);
}

/** Natural logarithm. x = m·2^e with m in [1, 2), then log(m) = 2·atanh((m−1)/(m+1)). */
export function log(x: number): number {
	if (x !== x || x < 0) return NaN;
	if (x === 0) return -Infinity;
	if (x === Infinity) return Infinity;
	let m = x;
	let e = 0;
	while (m >= 2) { m /= 2; e++; }
	while (m < 1) { m *= 2; e--; }
	const s = (m - 1) / (m + 1);
	const s2 = s * s;
	let term = s;
	let sum = 0;
	for (let n = 1; n <= 61; n += 2) {
		sum += term / n;
		term *= s2;
	}
	return 2 * sum + e * LN2;
}

/** x^y. Integer exponents use repeated multiplication (exact per step); other exponents use exp(y·log x). */
export function pow(x: number, y: number): number {
	if (y === 0) return 1;
	if (x !== x || y !== y) return NaN;
	if (Number.isInteger(y) && Math.abs(y) <= 64) {
		let base = y < 0 ? 1 / x : x;
		let n = Math.abs(y);
		let result = 1;
		while (n > 0) {
			if (n & 1) result *= base;
			base *= base;
			n >>= 1;
		}
		return result;
	}
	if (x === 0) return y > 0 ? 0 : Infinity;
	if (x < 0) return NaN; // non-integer powers of negative bases are not used by the simulation
	return exp(y * log(x));
}

/** Reduces an angle to [−π, π]. */
function reduceAngle(x: number): number {
	const k = Math.round(x / TWO_PI);
	return x - k * TWO_PI;
}

export function sin(x: number): number {
	const r = reduceAngle(x);
	const r2 = r * r;
	let term = r;
	let sum = r;
	for (let n = 1; n <= 12; n++) {
		term = -term * r2 / ((2 * n) * (2 * n + 1));
		sum += term;
	}
	return sum;
}

export function cos(x: number): number {
	const r = reduceAngle(x);
	const r2 = r * r;
	let term = 1;
	let sum = 1;
	for (let n = 1; n <= 12; n++) {
		term = -term * r2 / ((2 * n - 1) * (2 * n));
		sum += term;
	}
	return sum;
}

/** arctangent for t ≥ 0 (the only case acos needs). */
function atanPositive(t: number): number {
	if (t > 1) return HALF_PI - atanPositive(1 / t);
	if (t > TAN_PI_8) return PI / 4 + atanPositive((t - 1) / (t + 1));
	const t2 = t * t;
	let power = t;
	let sum = 0;
	for (let n = 0; n <= 30; n++) {
		sum += (n % 2 === 0 ? 1 : -1) * power / (2 * n + 1);
		power *= t2;
	}
	return sum;
}

/** Arccosine. Inputs slightly outside [−1, 1] (floating-point noise) are clamped instead of giving NaN. */
export function acos(x: number): number {
	if (x !== x) return NaN;
	if (x >= 1) return 0;
	if (x <= -1) return PI;
	return 2 * atanPositive(Math.sqrt((1 - x) / (1 + x)));
}
