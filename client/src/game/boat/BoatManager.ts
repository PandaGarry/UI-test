import type {Player} from "../player/Player";
import {Boat} from "./Boat";
import {playerManager} from "../player/PlayerManager";
import {calculateBoatWaypoints, findStartingPoint} from "../../map/area/BoatPathfinding";
import {borderManager} from "../BorderManager";
import {gameTicker} from "../GameTicker";
import {BoatActionPacket} from "../../protocol/packet/game/BoatActionPacket";
import {packetRegistry, validatePacket} from "../../protocol/PacketManager";
import {bordersTile} from "../MathUtil";
import {gameMap} from "../GameData";
import {triggerDebugEvent} from "../DebugData";
import {gameInitRegistry} from "../Game";

class BoatManager {
	private readonly boats: Boat[] = [];

	reset(this: void): void {
		boatManager.boats.length = 0;
	}

	/**
	 * Finds a tile bordering water near the given tile (5x5 area).
	 * @param tile The tile to find water near.
	 * @returns The coast tile or null if no coast was found.
	 */
	findCoastNear(tile: number): number | null {
		const x = tile % gameMap.width;
		const y = Math.floor(tile / gameMap.width);

		for (let i = 0; i < 10; i++) {
			const sign = i % 2 === 0 ? -1 : 1;
			const ny = y + Math.ceil(i / 2) * sign;
			if (ny >= 0 && ny < gameMap.height) {
				for (let j = -Math.ceil(i / 2); j <= Math.floor(i / 2); j++) {
					const nx = x + j * sign;
					if (nx >= 0 && nx < gameMap.width && gameMap.getDistance(nx + ny * gameMap.width) === 0) {
						return nx + ny * gameMap.width;
					}
				}
			}
			const nx = x + (Math.floor(i / 2) + 1) * sign;
			if (nx >= 0 && nx < gameMap.width) {
				for (let j = -Math.floor(i / 2); j <= Math.ceil(i / 2); j++) {
					const ny = y + j * sign;
					if (ny >= 0 && ny < gameMap.height && gameMap.getDistance(nx + ny * gameMap.width) === 0) {
						return nx + ny * gameMap.width;
					}
				}
			}
		}
		return null;
	}

	/**
	 * Finds where a boat can be launched to attack an owner anywhere on its coast (not only near the tapped tile).
	 * Coast tiles of the owner are its border tiles next to water; the nearest ones to the tapped tile are tried first.
	 * @param owner The owner whose coast is attacked.
	 * @param from The tapped tile (used to order the candidates).
	 * @returns The coast tile and the start point of the boat, or null if the owner has no reachable coast.
	 */
	findBoatLaunch(owner: number, from: number): {coast: number; start: number} | null {
		const border = borderManager.getBorderTiles(owner);
		if (!border) return null;
		const w = gameMap.width;
		const fx = from % w;
		const fy = Math.floor(from / w);
		const candidates: {tile: number; d: number}[] = [];
		for (const tile of border) {
			if (gameMap.getDistance(tile) !== 0) continue;
			const dx = (tile % w) - fx;
			const dy = Math.floor(tile / w) - fy;
			candidates.push({tile, d: dx * dx + dy * dy});
		}
		candidates.sort((a, b) => a.d - b.d);
		for (const {tile} of candidates.slice(0, 16)) {
			const start = findStartingPoint(tile);
			if (start !== null) return {coast: tile, start};
		}
		return null;
	}

	/**
	 * Adds a boat to the boat manager.
	 * @param owner The owner of the boat.
	 * @param start The starting position of the boat.
	 * @param end The ending position of the boat.
	 * @param power The percentage of the owner's troops to send.
	 */
	addBoat(owner: Player, start: number, end: number, power: number): void {
		const path = calculateBoatWaypoints(start, end);

		if ((path as (number | undefined)[]).includes(undefined)) {
			triggerDebugEvent("Boat pathfinding invalid", `boat-path-undefined-${owner.id}`,
				{name: "Map Id", type: "string", value: gameMap.id}, {name: "Start position", type: "number", value: start}, {name: "End position", type: "number", value: end});
		}

		if (path.length > 0) {
			this.addBoatInternal(owner, path, power);
		}
	}

	/**
	 * Adds a boat to the boat manager.
	 * @param owner The owner of the boat.
	 * @param path The path to follow.
	 * @param power The percentage of the owner's troops to send.
	 */
	addBoatInternal(owner: Player, path: number[], power: number): void {
		const troops = Math.floor(owner.getTroops() * Math.min(1000, power) / 1000);
		owner.removeTroops(troops);

		this.boats.push(new Boat(owner, path, troops));
	}

	/**
	 * Removes a boat from the boat manager.
	 * @param boat The boat to remove.
	 */
	unregisterBoat(boat: Boat): void {
		const index = this.boats.indexOf(boat);
		if (index !== -1) {
			this.boats.splice(index, 1);
		}
	}

	tick(this: void): void {
		for (const boat of boatManager.boats) {
			boat.move();
		}
	}

	/**
	 * @returns The boats that are currently active
	 */
	getBoats(): Boat[] {
		return this.boats;
	}
}

export const boatManager = new BoatManager();

gameTicker.registry.register(boatManager.tick);
gameInitRegistry.register(boatManager.reset);

validatePacket(BoatActionPacket, packet => {
	return playerManager.validatePlayer(packet.player)
		&& gameMap.getDistance(packet.start) === -1 && gameMap.getDistance(packet.end) === 0
		&& bordersTile(packet.start, packet.player);
});

packetRegistry.handle(BoatActionPacket, function (this: BoatActionPacket): void {
	boatManager.addBoat(playerManager.getPlayer(this.player), this.start, this.end, this.power);
});