import type {GameGLContext} from "../GameGLContext";
import type {GameFont, GameTextEntry} from "../GameFont";
import {playerNameRenderingManager} from "../manager/PlayerNameRenderingManager";
import {playerManager} from "@frontline/core/game/player/PlayerManager";
import {gameRenderer, rendererContextGameplay, renderingContextInit} from "../GameRenderer";
import {BaseRendererLayer} from "./BaseRendererLayer";
import {mapFontData} from "../shader/ShaderManager";
import {mapNavigationHandler} from "../../input/MapNavigationHandler";
import {formatTroopsCompact} from "@frontline/core/util/StringFormatter";
import {getSetting} from "../../platform/settings/UserSettingManager";

// Largest label size on screen, in pixels.
const MAX_LABEL_PX = 44;
// Smallest label box on screen. GameFont sets the letter height to 0.46 of the box, so 28 px box = about 13 px letters:
// zoomed out, a label is drawn at least this big (it may run past its small territory), so it stays legible.
const MIN_LABEL_PX = 28;
// A territory this small on screen cannot hold a label at all; such labels are not drawn.
const HIDE_BELOW_PX = 5;


class NameRenderer extends BaseRendererLayer {
	private font: GameFont;

	setup(context: GameGLContext) {
		mapFontData(context).then(font => this.font = font).catch(() => {});
	}

	render(context: GameGLContext): void {
		if (!this.font) return;
		const xMin = mapNavigationHandler.getMapX(0);
		const xMax = mapNavigationHandler.getMapX(context.raw.canvas.width);
		const yMin = mapNavigationHandler.getMapY(0);
		const yMax = mapNavigationHandler.getMapY(context.raw.canvas.height);
		const toDraw: GameTextEntry[] = [];
		for (let i = 0; i < playerNameRenderingManager.playerData.length; i++) {
			const player = playerManager.getPlayer(i);
			if (player && player.isAlive()) {
				const data = playerNameRenderingManager.playerData[i];
				const zoom = mapNavigationHandler.zoom;
				if (data.size * zoom < HIDE_BELOW_PX) continue;
				// Labels scale with the territory, but stay between MIN_LABEL_PX and MAX_LABEL_PX on screen.
				// The label keeps the territory's centre, so a label grown when zoomed out stays on its territory.
				const size = Math.min(Math.max(data.size, MIN_LABEL_PX / zoom), MAX_LABEL_PX / zoom);
				const x = data.nameX + (data.size - size) / 2;
				const y = data.nameY + (data.size - size) / 2;
				if (x + size + 1 < xMin || x + 1 > xMax || y + size + 1 < yMin || y + 1 > yMax) {
					continue;
				}
				const c = getSetting("theme").getTerritoryColor(player.baseColor).toRGB();
				const halo: [number, number, number] = [c.r / 255, c.g / 255, c.b / 255];
				toDraw.push({string: player.name, x, y, size, baselineBottom: true, fitHeight: true, halo});
				toDraw.push({string: formatTroopsCompact(player.getTroops()), x, y: y + size / 2, size, fitHeight: true, halo});
			}
		}
		this.font.drawText(toDraw);
	}
}

export const nameRenderer = new NameRenderer();

renderingContextInit.register(id => id === rendererContextGameplay && gameRenderer.registerLayer(nameRenderer, 15));