import type {ClickEventListener} from "../../event/InteractionManager";
import {interactionManager} from "../../event/InteractionManager";
import {mapNavigationHandler} from "./MapNavigationHandler";
import {clientPlayer} from "../player/PlayerManager";
import {spawnManager} from "../player/SpawnManager";
import {boatManager} from "../boat/BoatManager";
import {territoryManager} from "../TerritoryManager";
import {hasBorderWith} from "../attack/AttackActionValidator";
import {isLocalGame, isPlaying} from "../GameData";
import {sendPacket, submitGameAction} from "../CommandChannel";
import {SpawnRequestPacket} from "../../protocol/packet/game/SpawnRequestPacket";
import {gameInitRegistry, gameStartRegistry} from "../Game";
import {gameTicker} from "../GameTicker";
import {AttackActionPacket} from "../../protocol/packet/game/AttackActionPacket";
import {findStartingPoint} from "../area/BoatPathfinding";
import {BoatActionPacket} from "../../protocol/packet/game/BoatActionPacket";

/**
 * Default map click action handler.
 * Executes the selected action on the clicked tile.
 */
class MapActionHandler implements ClickEventListener {
	private action: (tile: number) => void;
	private power: number;
	private screenAction: ((tile: number, x: number, y: number) => void) | null = null;

	/**
	 * Set the action to execute on a tile click.
	 * @param action The action to execute.
	 */
	setAction(action: (tile: number) => void) {
		this.action = action;
	}

	/**
	 * Set a handler that gets the screen position too (used by the radial menu).
	 * While it is set, it replaces the tile action on click.
	 */
	setScreenAction(action: ((tile: number, x: number, y: number) => void) | null) {
		this.screenAction = action;
	}

	/** Attacks the tile as a plain click would (border attack or boat). Used by the radial menu. */
	attackTile(tile: number) {
		MapActionHandler.attackAction(tile);
	}

	/** Naval attack: a boat sails from the coast to the tile. Possible only if a coast and a start point exist. */
	boatAttackTile(tile: number) {
		MapActionHandler.boatAttack(tile);
	}

	canBoatAttack(tile: number): boolean {
		return MapActionHandler.findLaunch(tile) !== null;
	}

	/**
	 * Set the power to attack with
	 * @param power The power to attack with
	 */
	setPower(power: number) {
		this.power = power;
	}

	/** A tap (press and release without moving, see InteractionManager) runs the screen action or the tile action. */
	onClick(x: number, y: number): void {
		const tile = mapNavigationHandler.getIndex(x, y);
		if (this.screenAction) {
			this.screenAction(tile, x, y);
			return;
		}
		this.action(tile);
	}

	test(x: number, y: number, _element: EventTarget | null): boolean {
		return isPlaying && !gameTicker.isPaused && mapNavigationHandler.isOnMap(x, y);
	}

	/**
	 * Action causing the player spawn to be selected when clicking on unclaimed territory
	 */
	static spawnSelectAction(this: void, tile: number) {
		if (territoryManager.getOwner(tile) === territoryManager.OWNER_NONE - 1) return;
		if (!spawnManager.isValidSpawnPoint(tile)) return;
		// The first pick brings the camera closer to the spawn (once per game, not on later picks).
		if (!spawnViewDone) {
			spawnViewDone = true;
			mapNavigationHandler.focusTile(tile);
		}
		if (!isLocalGame) {
			sendPacket(new SpawnRequestPacket(tile));
			return;
		}
		// Local games: the spawn can be moved until the spawn phase timer ends (see SpawnManager.beginSpawnPhase).
		spawnManager.selectSpawnPoint(clientPlayer.id, tile);
	}

	/**
	 * Action starting an attack against the clicked player, if the player can't be reached, a boat is sent instead
	 */
	static attackAction(this: void, tile: number) {
		// Water is not a land target; the server would reject the attack, so nothing is sent.
		if (territoryManager.isWater(tile)) return;
		if (hasBorderWith(clientPlayer, territoryManager.getOwner(tile))) {
			submitGameAction(new AttackActionPacket(clientPlayer.id, territoryManager.getOwner(tile) === territoryManager.OWNER_NONE ? clientPlayer.id : territoryManager.getOwner(tile), mapActionHandler.power));
			notifyAttackSent();
		} else {
			MapActionHandler.boatAttack(tile);
		}
	}

	/** Coast and start point for a boat attack on the tile's owner (any coast of an enemy; neutral land uses the nearby coast). */
	static findLaunch(tile: number): {coast: number; start: number} | null {
		const owner = territoryManager.getOwner(tile);
		if (owner !== territoryManager.OWNER_NONE) return boatManager.findBoatLaunch(owner, tile);
		const coast = boatManager.findCoastNear(tile);
		if (coast === null) return null;
		const start = findStartingPoint(coast);
		return start === null ? null : {coast, start};
	}

	static boatAttack(this: void, tile: number) {
		const launch = MapActionHandler.findLaunch(tile);
		if (launch === null) return;
		submitGameAction(new BoatActionPacket(clientPlayer.id, launch.start, launch.coast, mapActionHandler.power));
		notifyAttackSent();
	}
}

/** An attack was sent: the HUD opens the attack list so the player sees it start. */
export const ATTACK_SENT_EVENT = "arena:attack-sent";
function notifyAttackSent() {
	window.dispatchEvent(new Event(ATTACK_SENT_EVENT));
}

export const mapActionHandler = new MapActionHandler();

interactionManager.click.register(mapActionHandler, -100);


let spawnViewDone = false;
gameInitRegistry.register(() => {
	spawnViewDone = false;
	mapActionHandler.setAction(MapActionHandler.spawnSelectAction);
});
gameStartRegistry.register(() => mapActionHandler.setAction(() => undefined));