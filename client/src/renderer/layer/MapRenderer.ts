import type {WebGLUniforms} from "../GameGLContext";
import type {GameTheme} from "../GameTheme";
import type {HSLColor} from "@frontline/core/util/HSLColor";
import {GameGLContext} from "../GameGLContext";
import {CachedLayer} from "./CachedLayer";
import {mapTransformHandler} from "../../input/MapTransformHandler";
import {getSetting, registerSettingListener} from "../../platform/settings/UserSettingManager";
import {mapRenderingFragmentShader, simpleTextureVertexShader, distanceMapFragmentShader} from "../shader/ShaderManager";
import {gameMap, isPlaying} from "@frontline/core/game/GameData";
import {gameRenderer, rendererContextGameplay, renderingContextInit} from "../GameRenderer";


/**
 * Map background renderer.
 * All static map tiles (and possibly other static objects) should be rendered here.
 * @internal
 */
class MapRenderer extends CachedLayer {
	private program: WebGLProgram;
	private vao: WebGLVertexArrayObject;
	private uniforms: WebGLUniforms<"texture_data" | "palette_data" | "tile_atlas" | "class_mean" | "tile_class" | "map_size" | "tile_cells" | "textures_on">;
	private details: (() => void)[];
	private atlas: WebGLTexture | null = null;
	private atlasMeans: Float32Array = new Float32Array(12);

	override setup(context: GameGLContext) {
		super.setup(context);
		this.program = context.requireProgram(simpleTextureVertexShader, mapRenderingFragmentShader, "Map renderer failed to init");
		this.vao = context.createVertexArray(this.program, GameGLContext.positionAttribute());
		this.uniforms = context.loadUniforms(this.program, "texture_data", "palette_data", "tile_atlas", "class_mean", "tile_class", "map_size", "tile_cells", "textures_on");
	}

	override init(context: GameGLContext): void {
		super.init(context);
		this.resizeCanvas(gameMap.width, gameMap.height);
		this.forceRepaint(getSetting("theme"));
		// A missing or undecodable atlas only turns the visual T layer off: the map itself is unchanged.
		this.loadAtlas()
			.then(() => this.forceRepaint(getSetting("theme")))
			.catch(error => console.warn("Map texture atlas unavailable, textures stay off", error));
	}

	/**
	 * Loads the T atlas (resources/textures/atlas.png, 512 x 2048: plains, hills, mountains, water) and measures the mean
	 * colour of each class, so the texture is divided by its own mean and the palette colour stays unchanged on average.
	 */
	private async loadAtlas(): Promise<void> {
		if (this.atlas) return;
		const img = new Image();
		img.src = "./../../../resources/textures/atlas.png";
		await img.decode();
		const canvas = document.createElement("canvas");
		canvas.width = img.width;
		canvas.height = img.height;
		const ctx2d = canvas.getContext("2d");
		if (!ctx2d) return;
		ctx2d.drawImage(img, 0, 0);
		const data = ctx2d.getImageData(0, 0, img.width, img.height).data;
		const band = img.height / 4;
		const pixels = img.width * band;
		for (let k = 0; k < 4; k++) {
			const sum = [0, 0, 0];
			for (let y = k * band; y < (k + 1) * band; y++) {
				for (let x = 0; x < img.width; x++) {
					const o = (y * img.width + x) * 4;
					sum[0] += data[o];
					sum[1] += data[o + 1];
					sum[2] += data[o + 2];
				}
			}
			for (let c = 0; c < 3; c++) this.atlasMeans[k * 3 + c] = sum[c] / pixels / 255;
		}
		this.atlas = this.context.createTexture(img.width, img.height, img, {minFilter: WebGL2RenderingContext.LINEAR, magFilter: WebGL2RenderingContext.LINEAR});
	}

	forceRepaint(theme: GameTheme): void {
		this.initDetails(theme);
		this.context.bind(this.program, this.vao, this.framebuffer);
		this.context.viewport(gameMap.width, gameMap.height);

		const palette = this.createPalette(theme);
		const mapData = this.context.createTexture(gameMap.width, gameMap.height, gameMap.tiles, {type: WebGL2RenderingContext.UNSIGNED_SHORT, internalFormat: WebGL2RenderingContext.R16UI, format: WebGL2RenderingContext.RED_INTEGER});
		const depthData = this.context.createTexture(gameMap.width, gameMap.height, gameMap.distanceMap, {type: WebGL2RenderingContext.SHORT, internalFormat: WebGL2RenderingContext.R16I, format: WebGL2RenderingContext.RED_INTEGER});

		this.context.bindTexture(depthData, 2);
		this.context.bindTexture(palette, 1);
		this.context.bindTexture(mapData, 0);

		this.uniforms.set1i("palette_data", 1);
		this.uniforms.set1i("texture_data", 0);
		this.setTextureUniforms();

		this.context.drawTriangles(2);

		this.details.forEach(detail => detail());

		this.context.deleteTexture(palette);
		this.context.deleteTexture(mapData);
		this.context.resetFramebuffer();
		this.context.viewport();
		// Shown smaller than native size (4-5 map texels per pixel on a phone): trilinear mipmaps remove the grain.
		this.buildMipmaps();
	}

	/** True when the T layer is drawn: atlas loaded and the player has it on. Territory tints multiply only then. */
	texturesActive(): boolean {
		return this.atlas !== null && getSetting("map-textures");
	}

	/** Visual T layer: class per tile type (-1 = no texture), atlas and means. Off when the player turns it off. */
	private setTextureUniforms(): void {
		const classOf = new Int32Array(64).fill(-1);
		for (const tileType of gameMap.tileTypes) {
			if (tileType.id < 64) classOf[tileType.id] = TILE_CLASS[tileType.colorBase] ?? -1;
		}
		this.uniforms.set1iv("tile_class", classOf);
		this.uniforms.set3fv("class_mean", this.atlasMeans);
		this.uniforms.set2f("map_size", gameMap.width, gameMap.height);
		this.uniforms.set1f("tile_cells", TEXTURE_TILE_CELLS);
		this.uniforms.set1i("textures_on", this.texturesActive() ? 1 : 0);
		if (this.atlas) {
			this.context.bindTexture(this.atlas, 3);
			this.uniforms.set1i("tile_atlas", 3);
		}
	}

	private createPalette(theme: GameTheme): WebGLTexture {
		const colors = new Uint8Array(2 ** 16 * 3);
		for (const tileType of gameMap.tileTypes) {
			const color = theme.getTileColor(tileType).toRGB();
			colors[tileType.id * 3] = color.r;
			colors[tileType.id * 3 + 1] = color.g;
			colors[tileType.id * 3 + 2] = color.b;
		}
		return this.context.createTexture(2 ** 8, 2 ** 8, colors);
	}

	onMapMove(this: void, x: number, y: number): void {
		mapRenderer.dx = x;
		mapRenderer.dy = y;
	}

	onMapScale(this: void, scale: number): void {
		mapRenderer.scale = scale;
	}

	private initDetails(theme: GameTheme): void {
		this.details = [];
		for (const detailData of theme.getShaderArgs()) {
			// Visual-only shore details follow the player's map-sand setting; they never change game data.
			if (detailData.args["shore"] && !getSetting("map-sand")) continue;
			if (detailData.args["depth"] && !getSetting("map-depth")) continue;
			const detail = detailList[detailData.name];
			if (!detail) {
				console.warn(`Unknown detail shader ${detailData.name}`);
				continue;
			}
			this.details.push(detail(this.context, detailData.args));
		}
	}
}

/** Class order of the T atlas (see scripts/textures/build-atlas.py). */
const TILE_CLASS: Record<string, number> = {grass: 0, highland: 1, mountain: 2, water: 3};
/** One atlas tile covers this many map cells (repeats across the map). */
const TEXTURE_TILE_CELLS = 96;

const detailList = {
	"territory-outline": (context: GameGLContext, args: { color: HSLColor, thickness: number }) => buildDetail(context, args.color, -args.thickness, 0, 0),
	"territory-inline": (context: GameGLContext, args: { color: HSLColor, thickness: number }) => buildDetail(context, args.color, 0, args.thickness, 0),
	"territory-outline-smooth": (context: GameGLContext, args: { color: HSLColor, thickness: number }) => buildDetail(context, args.color, -args.thickness, 0, 1 / args.thickness),
	"territory-inline-smooth": (context: GameGLContext, args: { color: HSLColor, thickness: number }) => buildDetail(context, args.color, 0, args.thickness, -1 / args.thickness),
	"fixed-distance": (context: GameGLContext, args: { color: HSLColor, min: number, max: number }) => buildDetail(context, args.color, args.min, args.max, 0),
	"dynamic-distance": (context: GameGLContext, args: { color: HSLColor, min: number, max: number, gradient: number }) => buildDetail(context, args.color, args.min, args.max, args.gradient)
} as Record<string, (context: GameGLContext, args: unknown) => () => void>;

function buildDetail(context: GameGLContext, color: HSLColor, min: number, max: number, gradient: number): () => void {
	const program = context.requireProgram(simpleTextureVertexShader, distanceMapFragmentShader, "Map detail failed to init");
	const vao = context.createVertexArray(program, GameGLContext.positionAttribute());
	const uniforms = context.loadUniforms(program, "dist_data", "min", "max", "gradient", "color");
	const rgb = color.toRGB();

	return () => {
		context.bind(program, vao);

		uniforms.set1i("dist_data", 2);
		uniforms.set1i("min", min);
		uniforms.set1i("max", max);
		uniforms.set4f("color", rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.a);
		uniforms.set1f("gradient", gradient);

		context.drawTriangles(2);
	}
}

export const mapRenderer = new MapRenderer();

mapTransformHandler.scale.register(mapRenderer.onMapScale);
mapTransformHandler.move.register(mapRenderer.onMapMove);
renderingContextInit.register(id => id === rendererContextGameplay && gameRenderer.registerLayer(mapRenderer, 5));

registerSettingListener("theme", (theme) => isPlaying && mapRenderer.forceRepaint(theme));
registerSettingListener("map-sand", () => isPlaying && mapRenderer.forceRepaint(getSetting("theme")));
registerSettingListener("map-depth", () => isPlaying && mapRenderer.forceRepaint(getSetting("theme")));
registerSettingListener("map-textures", () => isPlaying && mapRenderer.forceRepaint(getSetting("theme")));