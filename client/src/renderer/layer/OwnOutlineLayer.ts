import {CachedLayer} from "./CachedLayer";
import type {GameGLContext, WebGLUniforms} from "../GameGLContext";
import {gameMap} from "@frontline/core/game/GameData";
import {clientPlayer} from "@frontline/core/game/player/PlayerManager";
import {spawnManager} from "@frontline/core/game/player/SpawnManager";
import {gameRenderer, rendererContextGameplay, renderingContextInit} from "../GameRenderer";
import {mapGridLookupVertexShader, territoryRenderingFragmentShader} from "../shader/ShaderManager";

/** One full blink cycle (white -> black -> white), in milliseconds. Slow enough to be calm, fast enough to be seen. */
const BLINK_PERIOD_MS = 1400;
/** Half-size of the square outlined around the chosen spawn point (radius 2 = the 5x5 spawn area). */
const SPAWN_RING_RADIUS = 2;
/** Outline colour during the blink: black, with alpha pulsing smoothly between 0 and 1. */
const BLINK_RGB = [0, 0, 0] as const;

/**
 * Spawn-phase outline of the LOCAL PLAYER only (bots are never outlined). The outline is a square ring
 * around the spawn point the player picked, because the territory itself appears only when the phase ends.
 *
 * The outline is drawn on its own layer above the territory layer, so the territory fill and the
 * regular borders are not repainted. Every frame the layer redraws the local player's border tiles
 * in black with an alpha that follows a smooth sine wave: the border blinks between its normal colour
 * (white, from the territory layer) and black. The layer is hidden outside the spawn phase.
 * Visual only: the game logic never reads it.
 */
class OwnOutlineLayer extends CachedLayer {
	private program: WebGLProgram;
	private vao: WebGLVertexArrayObject;
	private uniforms: WebGLUniforms<"size" | "palette_data">;
	private palette: WebGLTexture;
	private tileBuffer: WebGLBuffer;
	private updateBuffer: WebGLBuffer;
	private tiles = new Uint32Array(0);
	private updates = new Uint32Array(0);

	override setup(context: GameGLContext) {
		super.setup(context);
		this.program = context.requireProgram(mapGridLookupVertexShader, territoryRenderingFragmentShader, "Own outline renderer failed to init");
		this.tileBuffer = context.createBuffer();
		this.updateBuffer = context.createBuffer();
		this.vao = context.createVertexArray(this.program, {name: "pos", buffer: this.tileBuffer, size: 1, type: WebGL2RenderingContext.UNSIGNED_INT, asInt: true}, {name: "id", buffer: this.updateBuffer, size: 1, type: WebGL2RenderingContext.UNSIGNED_INT, asInt: true});
		this.uniforms = context.loadUniforms(this.program, "size", "palette_data");
		// Palette with one texel used by this layer: index 0 = outline colour (alpha updated every frame).
		this.palette = context.createTexture(256, 512, new Uint8Array(256 * 512 * 4), {internalFormat: WebGL2RenderingContext.RGBA, format: WebGL2RenderingContext.RGBA});
	}

	override init(context: GameGLContext): void {
		super.init(context);
		this.resizeCanvas(gameMap.width, gameMap.height, true);
	}

	/** Alpha of the blink at the given time: a smooth 0 -> 1 -> 0 cycle. */
	private blinkAlpha(now: number): number {
		const phase = (now % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
		return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
	}

	/** Writes the blink alpha into the single palette texel this layer uses. */
	private updatePaletteTexel(alpha: number): void {
		const gl = this.context.raw;
		this.context.bindTexture(this.palette);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([BLINK_RGB[0], BLINK_RGB[1], BLINK_RGB[2], Math.round(alpha * 255)]));
	}

	/**
	 * Tiles of the square ring around the local player's chosen spawn point (the 5x5 spawn area, outer edge).
	 * During the spawn phase the territory does not exist yet, so the ring marks where it will be.
	 */
	private collectTiles(spawnTile: number): number {
		const w = gameMap.width;
		const h = gameMap.height;
		const cx = spawnTile % w;
		const cy = Math.floor(spawnTile / w);
		const size = (2 * SPAWN_RING_RADIUS + 1) * (2 * SPAWN_RING_RADIUS + 1);
		if (this.tiles.length < size) {
			this.tiles = new Uint32Array(size);
			this.updates = new Uint32Array(size);
		}
		let count = 0;
		for (let dy = -SPAWN_RING_RADIUS; dy <= SPAWN_RING_RADIUS; dy++) {
			for (let dx = -SPAWN_RING_RADIUS; dx <= SPAWN_RING_RADIUS; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== SPAWN_RING_RADIUS) continue;
				const x = cx + dx;
				const y = cy + dy;
				if (x < 0 || y < 0 || x >= w || y >= h) continue;
				this.tiles[count++] = y * w + x;
			}
		}
		return count;
	}

	override render(context: GameGLContext): void {
		// Only in the spawn phase and only for the local (human) player.
		if (!spawnManager.isSelecting || !clientPlayer) return;
		const spawnTile = spawnManager.spawnTileOf(clientPlayer.id);
		if (spawnTile === undefined) return;
		const count = this.collectTiles(spawnTile);
		this.updatePaletteTexel(this.blinkAlpha(performance.now()));

		const gl = this.context.raw;
		this.context.bind(this.program, this.vao, this.framebuffer);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		this.context.stopBlend();
		this.context.viewport(gameMap.width, gameMap.height);
		this.context.bindTexture(this.palette);
		this.uniforms.set2i("size", gameMap.width, gameMap.height);
		this.uniforms.set1i("palette_data", 0);
		this.context.bufferData(this.tileBuffer, this.tiles.subarray(0, count), WebGL2RenderingContext.DYNAMIC_DRAW);
		this.context.bufferData(this.updateBuffer, this.updates.subarray(0, count), WebGL2RenderingContext.DYNAMIC_DRAW);
		this.context.drawPoints(count);
		this.context.startBlendNatural();
		this.context.viewport();
		this.context.resetFramebuffer();

		super.render(context);
	}
}

export const ownOutlineLayer = new OwnOutlineLayer();

renderingContextInit.register(id => id === rendererContextGameplay && gameRenderer.registerLayer(ownOutlineLayer, 11));
