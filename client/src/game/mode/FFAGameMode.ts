import {GameMode} from "./GameMode";
import {BalanceConfig} from "../BalanceConfig";
import {largestPlayers} from "../GameStats";
import {playerManager} from "../player/PlayerManager";
import {FFAGameResult} from "../result/FFAGameResult";
import {registerGameMode} from "./GameModeRegistry";
import {GameModeIds} from "../../protocol/util/GameTypeIds";

//@module game

export class FFAGameMode extends GameMode {
	getResult() {
		// Win condition: control the configured share of total occupied territory.
		const totalTerritory = playerManager.getPlayers().reduce((acc, player) => acc + player.getTerritorySize(), 0);
		if (largestPlayers[0].getTerritorySize() > BalanceConfig.winTerritoryShare * totalTerritory) {
			return new FFAGameResult(largestPlayers[0]);
		}
		return null;
	}
}

registerGameMode(GameModeIds.FFA, new FFAGameMode());