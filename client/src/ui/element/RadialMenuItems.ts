import {mapActionHandler} from "../../input/MapActionHandler";
import {clientPlayer} from "@frontline/core/game/player/PlayerManager";
import {territoryManager} from "@frontline/core/game/TerritoryManager";
import {hasBorderWith} from "@frontline/core/game/attack/AttackActionValidator";
import type {RadialNode} from "../radial/RadialModel";

/**
 * Elements of the radial menu for one tile (game rules, no DOM). The composition follows the reference
 * (docs/RADIAL-MENU-REFERENCE-2026-10-18.md, 1.3): own tile → info, delete, alliance, build; other tile → info,
 * boat attack, alliance, attack; the centre button is the attack. Alliances, building and unit deletion are not in the
 * game yet, so their elements are shown but unavailable, with the reason in the hint.
 */
export interface TileMenu {
	/** Elements of the root ring, in order (index 0 is the top, then clockwise). */
	items: RadialNode[];
	center: RadialNode;
}

const NOT_YET = "Пока недоступно: в игре этого ещё нет.";

/** Why a land attack on the tile is unavailable, or null when it is available. */
function landAttackBlock(tile: number): string | null {
	if (territoryManager.getOwner(tile) === clientPlayer.id) return "Недоступно: это ваша территория.";
	if (territoryManager.isWater(tile)) return "Недоступно: это вода. Нужна морская атака.";
	if (!hasBorderWith(clientPlayer, territoryManager.getOwner(tile))) return "Недоступно: нет общей границы с этим владельцем.";
	return null;
}

export function buildTileMenu(tile: number): TileMenu {
	if (territoryManager.getOwner(tile) === clientPlayer.id) {
		const off = (id: string, label: string, hint: string): RadialNode => ({id, label, hint, enabled: false});
		return {
			items: [
				off("info", "Информация", "Сведения о вашей территории. " + NOT_YET),
				off("delete", "Удалить юнит", "Снять юнит с клетки. " + NOT_YET),
				off("ally", "Союз", "Предложить союз. " + NOT_YET),
				off("build", "Строить", "Постройки на территории. " + NOT_YET),
			],
			center: {id: "attack", label: "Атака", hint: "Недоступно: это ваша территория.", enabled: false},
		};
	}

	const landBlock = landAttackBlock(tile);
	const boatOk = mapActionHandler.canBoatAttack(tile);
	const attack: RadialNode = {
		id: "attack",
		label: "Атака",
		hint: landBlock ?? "Отправить войска на территорию соседа.",
		enabled: landBlock === null,
		run: () => mapActionHandler.attackTile(tile),
	};
	return {
		items: [
			{id: "info", label: "Информация", hint: "Сведения о владельце территории. " + NOT_YET, enabled: false},
			{
				id: "boat",
				label: "Морская атака",
				hint: boatOk ? "Атаковать с моря: корабль выходит с побережья." : "Недоступно: нет побережья, откуда можно выйти в море.",
				enabled: boatOk,
				run: () => mapActionHandler.boatAttackTile(tile),
			},
			{id: "ally", label: "Союз", hint: "Предложить союз. " + NOT_YET, enabled: false},
			attack,
		],
		center: attack,
	};
}
