import type {GameGLContext, WebGLUniforms} from "../GameGLContext";
import type {GameTheme} from "../GameTheme";
import {CachedLayer} from "./CachedLayer";
import {mapTransformHandler} from "../../input/MapTransformHandler";
import {gameMap} from "@frontline/core/game/GameData";
import {TerritoryRenderingManager} from "../manager/TerritoryRenderingManager";
import {getSetting, registerSettingListener} from "../../platform/settings/UserSettingManager";
import {registerTransactionExecutor} from "@frontline/core/game/transaction/TransactionExecutors";
import {TerritoryTransaction} from "@frontline/core/game/transaction/TerritoryTransaction";
import {gameRenderer, rendererContextGameplay, renderingContextInit} from "../GameRenderer";
import {playerManager} from "@frontline/core/game/player/PlayerManager";
import {mapRenderer} from "./MapRenderer";
import {mapGridLookupVertexShader, territoryRenderingFragmentShader} from "../shader/ShaderManager";


/**
 * Territory colours as in the reference game (OpenFrontIO default-theme.json): humans take a colour from the
 * humanColors list, bots take the flat Bot team colour. Visual only; the game logic does not read these colours.
 */
const REFERENCE_HUMAN_COLORS = [
	"#a3e635",
	"#84cc16",
	"#10b981",
	"#34d399",
	"#2dd4bf",
	"#4ade80",
	"#6ee7b7",
	"#86efac",
	"#97ffbb",
	"#baffc9",
	"#e6fad2",
	"#22c55e",
	"#43be54",
	"#52b788",
	"#30b2b4",
	"#e6fffa",
	"#dcf0fa",
	"#e9d5ff",
	"#ccccff",
	"#dcdcff",
	"#cae1ff",
	"#93c5fd",
	"#7dd3fc",
	"#63cafd",
	"#38bdf8",
	"#60a5fa",
	"#3b82f6",
	"#4f46e5",
	"#7c3aed",
	"#9333ea",
	"#b388ff",
	"#a78bfa",
	"#d946ef",
	"#a855f7",
	"#be5cfb",
	"#c084fc",
	"#f0abfc",
	"#f472b6",
	"#ec4899",
	"#dc2626",
	"#ef4444",
	"#eb4b4b",
	"#f56565",
	"#f87171",
	"#fb7185",
	"#fda4af",
	"#fca5a5",
	"#ffcce5",
	"#fad7e1",
	"#fbebf5",
	"#f0f0c8",
	"#fafad2",
	"#fff0c8",
	"#ffdfba",
	"#fcd34d",
	"#fbbf24",
	"#eab308",
	"#ca8a04",
	"#f59e0b",
	"#fb923c",
	"#f97316",
	"#ea580c",
	"#854d0e",
];
const REFERENCE_BOT_COLOR = "#d1cdc7";
/** Reference render-settings.json mapOverlay: territoryAlpha 0.588, territorySaturation 0.85. */
const TINT_ALPHA = 150 / 255;
const TINT_SATURATION = 0.85;
/** Reference: the border is the territory colour at full brightness (borderLightnessScale 1), fully opaque. */
const BORDER_ALPHA = 1;

function hexToRgb(hex: string): {r: number; g: number; b: number} {
	const v = parseInt(hex.slice(1), 16);
	return {r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255};
}

/** Reference fill: blend toward the colour's luminance (same weights as territory.frag.glsl). */
function desaturate(c: {r: number; g: number; b: number}, s: number): {r: number; g: number; b: number} {
	const luma = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
	const mix = (x: number) => luma + (x - luma) * s;
	return {r: mix(c.r), g: mix(c.g), b: mix(c.b)};
}

function referenceColorOf(player: {id: number; isBot(): boolean}): {r: number; g: number; b: number} {
	return hexToRgb(player.isBot() ? REFERENCE_BOT_COLOR : REFERENCE_HUMAN_COLORS[player.id % REFERENCE_HUMAN_COLORS.length]);
}

/**
 * Territory renderer.
 * Renders territory colors on the map (e.g. player territories).
 * @internal
 */
class TerritoryRenderer extends CachedLayer {
	readonly manager: TerritoryRenderingManager = new TerritoryRenderingManager();
	private program: WebGLProgram;
	private vao: WebGLVertexArrayObject;
	private uniforms: WebGLUniforms<"size" | "palette_data">;
	private palette: WebGLTexture;
	private tileBuffer: WebGLBuffer;
	private updateBuffer: WebGLBuffer;
	/** Multiply mode (map textures on): owner colour multiplies the map under it instead of covering it. Visual only. */
	private multiply: boolean = false;
	private clearPending: boolean = true;

	override setup(context: GameGLContext) {
		super.setup(context);
		this.program = context.requireProgram(mapGridLookupVertexShader, territoryRenderingFragmentShader, "Territory renderer failed to init");
		this.tileBuffer = context.createBuffer();
		this.updateBuffer = context.createBuffer();
		this.vao = context.createVertexArray(this.program, {name: "pos", buffer: this.tileBuffer, size: 1, type: WebGL2RenderingContext.UNSIGNED_INT, asInt: true}, {name: "id", buffer: this.updateBuffer, size: 1, type: WebGL2RenderingContext.UNSIGNED_INT, asInt: true});
		this.uniforms = context.loadUniforms(this.program, "size", "palette_data");
		this.updatePalette(getSetting("theme"));
	}

	override init(context: GameGLContext): void {
		super.init(context);
		this.resizeCanvas(gameMap.width, gameMap.height, true);
		this.clearPending = true;
	}

	updatePalette(theme: GameTheme): void {
		const multiply = mapRenderer.texturesActive() && getSetting("map-texture-tint");
		if (multiply !== this.multiply) {
			this.multiply = multiply;
			this.clearPending = true;
		}
		const colors = new Uint8Array(65536 * 2 * 4);
		// Normal mode: colour with its alpha. Multiply mode: the multiplier mix(1, colour, alpha), opaque, so
		// unowned cells stay white (no change) and the texture under an owned cell is tinted, not covered.
		const put = (offset: number, c: {r: number; g: number; b: number; a?: number}, strength: number) => {
			if (multiply) {
				const k = strength;
				colors[offset] = 255 + (c.r - 255) * k;
				colors[offset + 1] = 255 + (c.g - 255) * k;
				colors[offset + 2] = 255 + (c.b - 255) * k;
				colors[offset + 3] = 255;
			} else {
				colors[offset] = c.r;
				colors[offset + 1] = c.g;
				colors[offset + 2] = c.b;
				colors[offset + 3] = (c.a ?? 1) * 255;
			}
		};
		for (const player of playerManager.getPlayers()) {
			if (multiply) {
				const base = referenceColorOf(player);
				put(player.id * 4, desaturate(base, TINT_SATURATION), TINT_ALPHA);
				put(65536 * 4 + player.id * 4, base, BORDER_ALPHA);
			} else {
				put(player.id * 4, theme.getTerritoryColor(player.baseColor).toRGB(), 0);
				put(65536 * 4 + player.id * 4, theme.getBorderColor(player.baseColor).toRGB(), 0);
			}
		}
		this.palette = this.context.createTexture(256, 512, colors, {internalFormat: WebGL2RenderingContext.RGBA, format: WebGL2RenderingContext.RGBA});
	}

	override render(context: GameGLContext) {
		if (this.clearPending) {
			// Multiply mode starts from white (no change); normal mode from transparent.
			this.clearPending = false;
			const gl = this.context.raw;
			this.context.bindFramebuffer(this.framebuffer);
			const v = this.multiply ? 1 : 0;
			gl.clearColor(v, v, v, v);
			gl.clear(gl.COLOR_BUFFER_BIT);
			this.context.resetFramebuffer();
		}
		if (this.manager.pending > 0) {
			this.context.bind(this.program, this.vao, this.framebuffer);
			this.context.stopBlend();
			this.context.viewport(gameMap.width, gameMap.height);
			this.context.bindTexture(this.palette);

			this.uniforms.set2i("size", gameMap.width, gameMap.height);
			this.uniforms.set1i("palette_data", 0);

			this.context.bufferData(this.tileBuffer, this.manager.tiles, WebGL2RenderingContext.DYNAMIC_DRAW);
			this.context.bufferData(this.updateBuffer, this.manager.updates, WebGL2RenderingContext.DYNAMIC_DRAW);

			this.context.drawPoints(this.manager.pending);

			this.context.startBlend();
			this.context.viewport();
			this.context.resetFramebuffer();
			this.manager.take();
		}
		if (this.multiply) {
			// Composite as a multiplier: out = map * cache (cache alpha is 1 in this mode).
			const gl = this.context.raw;
			this.context.startBlend(gl.DST_COLOR, gl.ZERO, gl.ONE, gl.ZERO);
			super.render(context);
			this.context.startBlendNatural();
		} else {
			super.render(context);
		}
	}

	onMapMove(this: void, x: number, y: number): void {
		territoryRenderer.dx = x;
		territoryRenderer.dy = y;
	}

	onMapScale(this: void, scale: number): void {
		territoryRenderer.scale = scale;
	}
}

export const territoryRenderer = new TerritoryRenderer();

mapTransformHandler.scale.register(territoryRenderer.onMapScale);
mapTransformHandler.move.register(territoryRenderer.onMapMove);
renderingContextInit.register(id => id === rendererContextGameplay && gameRenderer.registerLayer(territoryRenderer, 10));

registerSettingListener("theme", territoryRenderer.manager.forceRepaint.bind(territoryRenderer.manager));
registerSettingListener("map-textures", () => territoryRenderer.manager.forceRepaint(getSetting("theme")));
registerSettingListener("map-texture-tint", () => territoryRenderer.manager.forceRepaint(getSetting("theme")));

registerTransactionExecutor(TerritoryTransaction, function (this: TerritoryTransaction) {
	//TODO: this needs to be less magical for clearing
	if (this.attacker) {
		territoryRenderer.manager.paintTiles(this.borderData.territory, this.attacker.id);
		territoryRenderer.manager.paintBorderTiles(this.borderData.attacker, this.attacker.id);
	} else {
		territoryRenderer.manager.clearTiles(this.tiles);
	}

	if (this.defendant) {
		territoryRenderer.manager.paintBorderTiles(this.borderData.defender, this.defendant.id);
		territoryRenderer.manager.paintTiles(this.borderData.defenderInner, this.defendant.id);
	}
});