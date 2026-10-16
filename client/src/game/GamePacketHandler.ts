import {packetRegistry} from "../protocol/PacketManager";
import {GameStartPacket} from "../protocol/packet/game/GameStartPacket";
import {GameTickPacket} from "../protocol/packet/game/GameTickPacket";
import {BalanceConfig} from "../game/BalanceConfig";
import {gameTicker} from "./GameTicker";
import {spawnManager} from "./player/SpawnManager";
import {gameResultRegistry, pauseGame, quitGame} from "./Game";
import {gameMode} from "./GameData";
import {tryStartGame} from "./GameLoader";

//@module game

packetRegistry.handle(GameStartPacket, function () {
	tryStartGame(this.map, this.mode, this.seed, this.players, this.clientId, false);
});

packetRegistry.handle(GameTickPacket, function () {
	if (this.index === 0 && !gameTicker.isRunning) {
		spawnManager.finalizeSelection();
	}
	const expectedIndex = Math.ceil(gameTicker.getTickCount() / BalanceConfig.ticksPerPacket) + gameTicker.dataPacketQueue.length;
	if (this.index === expectedIndex % 256) {
		gameTicker.addPacket(this);
	} else {
		console.warn(`Received out-of-order game tick packet ${this.index} expected ${expectedIndex % 256}`);
		//TODO: Handle out-of-order packets: Cache this packet and request missing packets from the server
		//TODO: Show error message to the user
		quitGame();
	}
});

gameTicker.registry.register(() => {
	const result = gameMode.getResult();
	if (result) {
		gameResultRegistry.broadcast(result);
		pauseGame();
		//TODO: allow continuing if player wants to
	}
});