import type {ClickEventListener} from "../../event/InteractionManager";
import {interactionManager} from "../../event/InteractionManager";
import {mapNavigationHandler} from "./MapNavigationHandler";
import {clientPlayer} from "../player/PlayerManager";
import {spawnManager} from "../player/SpawnManager";
import {boatManager} from "../boat/BoatManager";
import {territoryManager} from "../TerritoryManager";
import {hasBorderWith} from "../attack/AttackActionValidator";
import {isLocalGame, isPlaying} from "../GameData";
import {sendPacket, submitGameAction} from "../../network/NetworkManager";
import {SpawnRequestPacket} from "../../network/protocol/packet/game/SpawnRequestPacket";
import {gameInitRegistry, gameStartRegistry} from "../Game";
import {gameTicker} from "../GameTicker";
import {AttackActionPacket} from "../../network/protocol/packet/game/AttackActionPacket";
import {findStartingPoint} from "../../map/area/BoatPathfinding";
import {BoatActionPacket} from "../../network/protocol/packet/game/BoatActionPacket";

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

	hasScreenAction(): boolean {
		return this.screenAction !== null;
	}

	runScreenAction(tile: number, x: number, y: number) {
		this.screenAction?.(tile, x, y);
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
		const coast = boatManager.findCoastNear(tile);
		return coast !== null && findStartingPoint(coast) !== null;
	}

	/**
	 * Set the power to attack with
	 * @param power The power to attack with
	 */
	setPower(power: number) {
		this.power = power;
	}

	/** A short tap runs the tile action (spawn selection); during play it does nothing, the menu needs a long press. */
	onClick(x: number, y: number): void {
		if (this.screenAction) return;
		this.action(mapNavigationHandler.getIndex(x, y));
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
		if (hasBorderWith(clientPlayer, territoryManager.getOwner(tile))) {
			submitGameAction(new AttackActionPacket(clientPlayer.id, territoryManager.getOwner(tile) === territoryManager.OWNER_NONE ? clientPlayer.id : territoryManager.getOwner(tile), mapActionHandler.power));
		} else {
			MapActionHandler.boatAttack(tile);
		}
	}

	static boatAttack(this: void, tile: number) {
		const coast = boatManager.findCoastNear(tile);
		if (coast === null) return;
		const start = findStartingPoint(coast);
		if (start === null) return;
		submitGameAction(new BoatActionPacket(clientPlayer.id, start, coast, mapActionHandler.power));
	}
}

export const mapActionHandler = new MapActionHandler();

interactionManager.click.register(mapActionHandler, -100);

// Long press on the map opens the radial menu (see RadialMenu.ts); it does nothing before the game starts.
interactionManager.longPress.register({
	test: (x: number, y: number) => mapActionHandler.hasScreenAction() && isPlaying && !gameTicker.isPaused && mapNavigationHandler.isOnMap(x, y),
	onClick: (x: number, y: number) => mapActionHandler.runScreenAction(mapNavigationHandler.getIndex(x, y), x, y),
}, -100);

gameInitRegistry.register(() => mapActionHandler.setAction(MapActionHandler.spawnSelectAction));
gameStartRegistry.register(() => mapActionHandler.setAction(() => undefined));