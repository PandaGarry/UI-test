import type {RendererLayer} from "./layer/RendererLayer";
import {windowResizeHandler} from "../event/WindowResizeHandler";
import {gameInitRegistry} from "@frontline/core/game/Game";
import {EventHandlerRegistry} from "@frontline/core/util/events/EventHandlerRegistry";
import {GameGLContext} from "./GameGLContext";
import {SortedArray} from "@frontline/core/util/SortedArray";


/**
 * Main renderer for anything canvas related in the game.
 * Paints images on multiple layers (in order) to the canvas.
 * @internal
 */
export class GameRenderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: GameGLContext;
	private layers: SortedArray<RendererLayer> = new SortedArray();
	private awaitingFirstGameplayFrame = false;
	private awaitingSince = 0;

	constructor() {
		this.canvas = document.createElement("canvas");
		this.canvas.id = "gameCanvas";
		this.canvas.style.position = "absolute";
		this.canvas.style.left = "0";
		this.canvas.style.top = "0";
		this.canvas.style.zIndex = "-1";
		//TODO: Notify user if webgl is not supported (can't play this game...)
		this.context = new GameGLContext(this.canvas.getContext("webgl2", {premultipliedAlpha: false}) as WebGL2RenderingContext);
		this.context.startBlendNatural();

		this.doRenderTick();

		document.body.appendChild(this.canvas);
	}

	/**
	 * Changes rendering context, allows relevant layers to be added.
	 * Note: Choose large unique ids for third party contexts to avoid conflicts.
	 * @internal
	 */
	switchContext(context: number) {
		this.layers.clear();
		renderingContextInit.broadcast(context, this.context);
		this.awaitingFirstGameplayFrame = context === rendererContextGameplay;
		this.awaitingSince = performance.now();
	}

	/**
	 * Register a new layer to be rendered.
	 *
	 * This renderer will be rendered on top of all other layers.
	 * Note that you will have to re-register every time the renderer is changed (e.g. when a game is started).
	 *
	 * @param layer the layer to be rendered.
	 * @param zIndex the z-index of the layer. Layers with higher z-index will be rendered on top of layers with lower z-index.
	 */
	registerLayer(layer: RendererLayer, zIndex: number): void {
		try {
			layer.init(this.context);
			this.layers.add(layer, zIndex);
		} catch (e) {
			//TODO: warn user
			console.error(e);
		}
	}

	/**
	 * Tick layers and render them to the canvas.
	 */
	private doRenderTick(): void {
		this.layers.forEach(layer => {
			layer.render(this.context);
		});
		if (this.awaitingFirstGameplayFrame) {
			// The first gameplay frame counts only when the map is visibly drawn and its textures are settled (a black canvas means the layers
			// have not uploaded yet). Fallback after FIRST_FRAME_CAP_MS so a stuck layer cannot hold the game forever.
			const elapsed = performance.now() - this.awaitingSince;
			const visible = this.hasVisibleContent();
			if ((visible && mapTextureState.settled) || elapsed > FIRST_FRAME_CAP_MS) {
				this.awaitingFirstGameplayFrame = false;
				// Diagnostics: time from the switch to the gameplay context until the map is visibly drawn.
				console.info(`[frontline] first gameplay frame: ${Math.round(elapsed)} ms, visible map: ${visible}`);
				gameFirstFrameRegistry.broadcast();
			}
		}
		requestAnimationFrame(() => this.doRenderTick());
	}

	/** Samples a grid of pixels from the canvas: true when enough of them are not black. */
	private hasVisibleContent(): boolean {
		const gl = this.context.raw;
		const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
		if (w === 0 || h === 0) return false;
		const px = new Uint8Array(4);
		let visible = 0;
		const grid = 9;
		for (let i = 0; i < grid; i++) {
			for (let j = 0; j < grid; j++) {
				gl.readPixels(Math.floor(((i + 0.5) / grid) * w), Math.floor(((j + 0.5) / grid) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
				if (Math.max(px[0], px[1], px[2]) > 24) visible++;
			}
		}
		return visible >= (grid * grid) / 4;
	}

	resize(this: void, width: number, height: number): void {
		gameRenderer.canvas.width = Math.ceil(width / window.devicePixelRatio);
		gameRenderer.canvas.height = Math.ceil(height / window.devicePixelRatio);
		gameRenderer.context.viewport();
	}
}

export const rendererContextGameplay = 1;

/** Safety cap only: the loading window waits for a visibly drawn map up to this long (slow devices). */
const FIRST_FRAME_CAP_MS = 10000;

/**
 * Map textures state for the current game: false while the atlas is loading or the terrain is being repainted with it.
 * The first gameplay frame waits for it, so the loading window closes only on a fully textured map.
 */
export const mapTextureState = {settled: false};

/** Fired once after the first gameplay frame is drawn (the loading window listens to it). */
export const gameFirstFrameRegistry = new EventHandlerRegistry<[]>();

export const gameRenderer = new GameRenderer();
export const renderingContextInit = new EventHandlerRegistry<[number, GameGLContext]>();

windowResizeHandler.register(gameRenderer.resize);
gameInitRegistry.register(() => gameRenderer.switchContext(rendererContextGameplay));