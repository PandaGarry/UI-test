import {packetRegistry} from "@frontline/core/protocol/PacketManager";
import {gameResultRegistry} from "@frontline/core/game/Game";
import {gameLoadFailRegistry} from "../../../client/src/loader/GameLoader.ts";
import {sleep} from "bun";
import {deserializePacket} from "@frontline/core/protocol/DataTransferContext";
import {useAuthentication} from "./client/src/network/api/Endpoint.ts";
import {gameTicker} from "@frontline/core/game/GameTicker";
import {configureRunnerMapSource} from "./MapSource.ts";

configureRunnerMapSource();

if (process.env.SERVICE_TOKEN) {
	const token = "Bearer " + process.env.SERVICE_TOKEN;
	useAuthentication(async options => {
		options.headers = new Headers(options.headers);
		options.headers.set("Authorization", token);
		return options;
	});
}

gameResultRegistry.register((result) => {
	process.send && process.send(result);
	gameTicker.stop();
	process.exit(0);
});

//TODO: This needs to be automated based on module flags
require("@frontline/core/game/bot/modifier/BoatAttackStrategy");
require("@frontline/core/game/bot/modifier/BotConstraints");
require("@frontline/core/game/bot/modifier/BotTrigger");
require("@frontline/core/game/bot/modifier/SimpleAttackStrategy");
require("../../../client/src/network/GamePacketHandler");
require("@frontline/core/game/mode/FFAGameMode");

gameLoadFailRegistry.register((e) => console.error(e));

process.on("message", msg => {
	if (msg === "exit") process.exit(0);
	deserializePacket(msg as Uint8Array, packetRegistry).handle();
});

await sleep(8 * 60 * 60 * 1000); // time out after 8 hours
process.exit(0);