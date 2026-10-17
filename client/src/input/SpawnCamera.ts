import {spawnSelectionEndedRegistry} from "@frontline/core/game/Game";
import {clientPlayer} from "@frontline/core/game/player/PlayerManager";
import {spawnManager} from "@frontline/core/game/player/SpawnManager";
import {mapNavigationHandler} from "./MapNavigationHandler";

/**
 * Zoom (screen px per tile) the camera moves to when the spawn phase ends.
 * Reference: GoToPlayerEvent(myPlayer, 8) after the spawn phase (ClientGameRunner).
 */
export const SPAWN_END_ZOOM = 8;

/**
 * When the spawn selection ends: the camera moves to the player's spawn and zooms in on it,
 * so the player sees their own territory right after the phase.
 */
spawnSelectionEndedRegistry.register(() => {
	if (!clientPlayer) return;
	const tile = spawnManager.spawnTileOf(clientPlayer.id);
	if (tile === undefined) return;
	mapNavigationHandler.focusTileAtZoom(tile, SPAWN_END_ZOOM);
});
