import type {DragEventListener, MultiTouchEventListener, ScrollEventListener} from "../event/InteractionManager";
import {interactionManager} from "../event/InteractionManager";
import {mapTransformHandler} from "./MapTransformHandler";
import {gameMap, isPlaying} from "@frontline/core/game/GameData";
import {windowResizeHandler} from "../event/WindowResizeHandler";
import {gameInitRegistry, gameQuitRegistry} from "@frontline/core/game/Game";

/**
 * Default map navigation handler.
 * Controls the map position and zoom level.
 * @see MapTransformHandler
 */
/** Zoom limits in screen pixels per map tile, as the reference game (Camera.ts: MIN_ZOOM 0.2, MAX_ZOOM 20). */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 20;

/** Zoom multiplier for the spawn view: a moderate zoom so the player sees where the nation starts (provisional, measure against the reference). */
export const SPAWN_FOCUS_ZOOM_FACTOR = 2.5;
/** Duration of the camera move to the spawn, ms. */
export const FOCUS_DURATION_MS = 300;

class MapNavigationHandler implements ScrollEventListener, DragEventListener, MultiTouchEventListener {
	x: number = 0;
	y: number = 0;
	zoom: number = 1;
	private focusFrame: number | null = null;
	/** Set when the spawn focus moved the camera; the next enable() keeps that view instead of resetting it. */
	private keepViewOnEnable: boolean = false;

	/**
	 * Enables the map navigation handler.
	 * Sets the initial zoom level and position to center the map on the screen.
	 */
	enable() {
		// Game start runs this again; keep the spawn view chosen before the start instead of resetting to the default view.
		if (!this.keepViewOnEnable) {
			const minXZoom = window.innerWidth / gameMap.width, minYZoom = window.innerHeight / gameMap.height;
			this.zoom = 0.9 * Math.min(minXZoom, minYZoom);
			this.x = (window.innerWidth - gameMap.width * this.zoom) / 2;
			this.y = (window.innerHeight - gameMap.height * this.zoom) / 2;
		}
		this.keepViewOnEnable = false;
		mapTransformHandler.scale.broadcast();
		mapTransformHandler.move.broadcast();
		interactionManager.drag.register(this, -100);
		interactionManager.scroll.register(this, -100);
		interactionManager.multitouch.register(this, -100);
	}

	/**
	 * Disables the map navigation handler.
	 */
	disable() {
		interactionManager.drag.unregister(this);
		interactionManager.scroll.unregister(this);
		interactionManager.multitouch.unregister(this);
	}

	/**
	 * Moves the camera so the tile sits in the middle of the screen and zooms in on it (smooth, ~300 ms).
	 * Used once, on the first spawn pick. A drag or zoom by the user cancels the move. Not used during play.
	 */
	focusTile(tile: number, zoomFactor: number = SPAWN_FOCUS_ZOOM_FACTOR, done?: (screenX: number, screenY: number) => void): void {
		this.cancelFocus();
		this.keepViewOnEnable = true;
		const w = gameMap.width;
		const tx = (tile % w) + 0.5;
		const ty = Math.floor(tile / w) + 0.5;
		const fromX = this.x, fromY = this.y, fromZoom = this.zoom;
		const toZoom = Math.min(MAX_ZOOM, fromZoom * zoomFactor);
		const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
		const toX = Math.max(Math.min(cx - tx * toZoom, window.innerWidth - 100), 100 - gameMap.width * toZoom);
		const toY = Math.max(Math.min(cy - ty * toZoom, window.innerHeight - 100), 100 - gameMap.height * toZoom);
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / FOCUS_DURATION_MS);
			const e = 1 - Math.pow(1 - t, 3); // ease-out
			this.zoom = fromZoom + (toZoom - fromZoom) * e;
			this.x = fromX + (toX - fromX) * e;
			this.y = fromY + (toY - fromY) * e;
			mapTransformHandler.scale.broadcast();
			mapTransformHandler.move.broadcast();
			if (t < 1) {
				this.focusFrame = requestAnimationFrame(step);
			} else {
				this.focusFrame = null;
				done?.(this.x + tx * this.zoom, this.y + ty * this.zoom);
			}
		};
		this.focusFrame = requestAnimationFrame(step);
	}

	private cancelFocus(): void {
		if (this.focusFrame !== null) {
			cancelAnimationFrame(this.focusFrame);
			this.focusFrame = null;
		}
	}

	onScroll(x: number, y: number, delta: number): void {
		this.cancelFocus();
		if (delta > 0) {
			this.processZoom(x, y, this.zoom / (1 + delta / 600));
		} else {
			this.processZoom(x, y, this.zoom * (1 - delta / 600));
		}
	}

	private processZoom(x: number, y: number, newZoom: number) {
		if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return;
		this.cancelFocus();
		const mapX = this.getMapX(x), mapY = this.getMapY(y);
		this.zoom = newZoom;
		this.x = Math.max(Math.min(-mapX * this.zoom + x, window.innerWidth - 100), 100 - gameMap.width * this.zoom);
		this.y = Math.max(Math.min(-mapY * this.zoom + y, window.innerHeight - 100), 100 - gameMap.height * this.zoom);
		mapTransformHandler.scale.broadcast();
		mapTransformHandler.move.broadcast();
	}

	onMultiTouch(oldX: number, oldY: number, newX: number, newY: number, factor: number) {
		this.cancelFocus();
		factor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, factor * this.zoom)) / this.zoom;
		this.x = Math.max(Math.min(newX - (oldX - this.x) * factor, window.innerWidth - 100), 100 - gameMap.width * this.zoom);
		this.y = Math.max(Math.min(newY - (oldY - this.y) * factor, window.innerHeight - 100), 100 - gameMap.height * this.zoom);
		this.zoom *= factor;
		mapTransformHandler.scale.broadcast();
		mapTransformHandler.move.broadcast();
	}

	test(_x: number, _y: number, _element: EventTarget | null): boolean {
		return true;
	}

	onDragStart(_x: number, _y: number): void {
		this.cancelFocus();
	}

	onDragEnd(_x: number, _y: number): void {
	}

	onDragMove(_x: number, _y: number, dx: number, dy: number): void {
		this.x = Math.max(Math.min(this.x + dx, window.innerWidth - 100), 100 - gameMap.width * this.zoom);
		this.y = Math.max(Math.min(this.y + dy, window.innerHeight - 100), 100 - gameMap.height * this.zoom);
		mapTransformHandler.move.broadcast();
	}

	/**
	 * Converts screen coordinates to map coordinates.
	 * @param x The x-coordinate on the screen.
	 */
	getMapX(x: number): number {
		return (x - this.x) / this.zoom;
	}

	/**
	 * Converts screen coordinates to map coordinates.
	 * @param y The y-coordinate on the screen.
	 */
	getMapY(y: number): number {
		return (y - this.y) / this.zoom;
	}

	/**
	 * Checks if the given screen coordinates are on the map.
	 * Not to be confused with map coordinates (This method does not convert screen coordinates to map coordinates).
	 * @param x The x-coordinate on the screen.
	 * @param y The y-coordinate on the screen.
	 */
	isOnMap(x: number, y: number): boolean {
		return x >= this.x && x < this.x + gameMap.width * this.zoom && y >= this.y && y < this.y + gameMap.height * this.zoom;
	}

	/**
	 * Converts screen coordinates to a map tile index.
	 * @param x The x-coordinate on the screen.
	 * @param y The y-coordinate on the screen.
	 */
	getIndex(x: number, y: number): number {
		return Math.floor((y - this.y) / this.zoom) * gameMap.width + Math.floor((x - this.x) / this.zoom);
	}
}

export const mapNavigationHandler = new MapNavigationHandler();

windowResizeHandler.register(() => isPlaying && mapNavigationHandler.onDragMove(0, 0, 0, 0));
gameInitRegistry.register(() => mapNavigationHandler.enable());
gameQuitRegistry.register(() => mapNavigationHandler.disable());