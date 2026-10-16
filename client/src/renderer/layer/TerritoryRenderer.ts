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
 * Multiply tint (map textures on). The fill is the player's colour, more saturated than the theme's pastel, at alpha
 * 150/255 (0.588, as in the reference). The border is the same colour darker (lightness x 0.6, the reference's
 * borderLightnessScale in colorblind-theme.json), so it reads against the fill. The multiplier mix(1, colour, alpha)
 * keeps the texture visible under the owner colour.
 */
const TINT_ALPHA = 150 / 255; // territory fill: alpha of the player colour
const TINT_SATURATE = 0.35; // territory fill: extra HSL saturation on top of the player colour
const BORDER_LIGHTNESS_SCALE = 0.6; // border line: lightness multiplier (reference colorblind theme)

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
		const put = (offset: number, c: {r: number; g: number; b: number; a: number}, strength: number) => {
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
				colors[offset + 3] = c.a * 255;
			}
		};
		for (const player of playerManager.getPlayers()) {
			if (multiply) {
				const fill = player.baseColor.withSaturation(Math.min(1, player.baseColor.s * (1 + TINT_SATURATE)));
				put(player.id * 4, fill.toRGB(), TINT_ALPHA);
				put(65536 * 4 + player.id * 4, fill.withLightness(fill.l * BORDER_LIGHTNESS_SCALE).toRGB(), 1);
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