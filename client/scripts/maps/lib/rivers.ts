/** River helpers for the foundation import (rivers are water in F; see docs/MAP-ARCHITECTURE, amendment 2026-10-16). */

/**
 * Make a river mask 4-connected: for a diagonal step between two river cells, add one of the two orthogonal
 * cells (the one on the left/top side, a fixed rule). The game moves in 4 directions, so a diagonal-only river
 * would be cut for boats and would let land pass through it.
 */
export function fourConnect(width: number, height: number, pixels: Uint8Array): Uint8Array {
	const out = Uint8Array.from(pixels, v => (v ? 1 : 0));
	for (let y = 0; y < height - 1; y++) {
		for (let x = 0; x < width - 1; x++) {
			const i = y * width + x;
			// Diagonal down-right and down-left pairs.
			if (out[i] && out[i + width + 1] && !out[i + 1] && !out[i + width]) out[i + width] = 1;
			if (out[i + 1] && out[i + width] && !out[i] && !out[i + width + 1]) out[i] = 1;
		}
	}
	return out;
}
