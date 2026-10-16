import {packetRegistry} from "@frontline/core/protocol/PacketManager";
import {GameStartPacket} from "@frontline/core/protocol/packet/game/GameStartPacket";
import {GameTickPacket} from "@frontline/core/protocol/packet/game/GameTickPacket";
import {BalanceConfig} from "@frontline/core/game/BalanceConfig";
import {gameTicker} from "@frontline/core/game/GameTicker";
import {spawnManager} from "@frontline/core/game/player/SpawnManager";
import {gameResultRegistry, pauseGame, quitGame} from "@frontline/core/game/Game";
import {gameMode} from "@frontline/core/game/GameData";
import {tryStartGame} from "../loader/GameLoader";


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