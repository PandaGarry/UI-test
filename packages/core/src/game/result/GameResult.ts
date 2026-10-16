import type {Player} from "../player/Player";
import {gameTicker} from "../GameTicker";

export abstract class GameResult {
	readonly time: number;
	readonly winners: Player[];

	constructor(winners: Player[]) {
		this.time = gameTicker.getElapsedTime();
		this.winners = winners;
	}
}