import type {Player} from "../player/Player";
import {GameResult} from "./GameResult";

export class FFAGameResult extends GameResult {
	constructor(winner: Player) {
		super([winner]);
	}
}
