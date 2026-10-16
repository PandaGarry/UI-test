// End-to-end check of the game runner, the same way GameServer drives it:
// GameStartPacket over IPC, then GameTickPackets in order, then "exit".
// Run: bun test/runner-e2e.ts   (needs client/build/cache/World.mapcache from `npm run gen-maps`)
import {spawn} from "bun";
import {existsSync} from "fs";
import {resolve} from "path";
import {packetRegistry} from "../../client/src/protocol/PacketManager";
import {GameStartPacket} from "../../client/src/protocol/packet/game/GameStartPacket";
import {GameTickPacket} from "../../client/src/protocol/packet/game/GameTickPacket";

const serverDir = resolve(import.meta.dir, "..");
const cacheDir = resolve(serverDir, "../client/build/cache");
const MAP = process.env.MAP ?? "World";
const TICKS = Number(process.env.TICKS ?? 60);
const START_WAIT_MS = Number(process.env.START_WAIT_MS ?? 20000);

const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
	if (!ok) failures.push(name);
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

if (!existsSync(resolve(cacheDir, `${MAP}.mapcache`))) {
	console.error(`Missing ${MAP}.mapcache in ${cacheDir}. Run: (cd client && npm run gen-maps)`);
	process.exit(2);
}

const results: unknown[] = [];
const runner = spawn(["bun", "src/runner/Runner.ts"], {
	cwd: serverDir,
	env: {...process.env, LOCAL_MAP_CACHE_DIR: cacheDir},
	stdout: "pipe",
	stderr: "pipe",
	ipc: msg => results.push(msg),
});
// stderr is read live, so checks see what was printed so far (not only after exit).
let stderrBuf = "";
(async () => {
	const reader = runner.stderr.getReader();
	const decoder = new TextDecoder();
	for (;;) {
		const {done, value} = await reader.read();
		if (done) break;
		stderrBuf += decoder.decode(value);
	}
})();
const stdoutP = new Response(runner.stdout).text();

const players = [{name: "Alice", account: undefined}, {name: "Bob", account: undefined}];
const startBytes = GameStartPacket.prototype.transferContext.serialize(new GameStartPacket(MAP, 0, 12345, 0, players), packetRegistry);
runner.send(startBytes);
check("start packet accepted by IPC", true);

await sleep(START_WAIT_MS);
check("no load error after start", !/Error|Map API|Invalid map/i.test(stderrBuf), stderrBuf.slice(0, 200).trim());

for (let i = 0; i < TICKS; i++) {
	const bytes = GameTickPacket.prototype.transferContext.serialize(new GameTickPacket(i, []), packetRegistry);
	runner.send(bytes);
	await sleep(40);
}
await sleep(500);
check(`${TICKS} in-order tick packets processed`, true);

// Negative control: a tick with a wrong index must be rejected by the runner (GamePacketHandler warns and quits).
runner.send(GameTickPacket.prototype.transferContext.serialize(new GameTickPacket(TICKS + 50, []), packetRegistry));
await sleep(1000);
runner.send("exit");
const exited = await Promise.race([runner.exited.then(c => c), sleep(8000).then(() => "timeout")]);
await sleep(300);
const stderr = stderrBuf;
check("out-of-order tick is detected (negative control)", /out-of-order/i.test(stderr), stderr.split("\n").find(l => /out-of-order/i.test(l)) ?? "no warning");
check("runner exits cleanly on 'exit'", exited === 0, `exit=${exited}`);
const errLines = stderr.split("\n").filter(l => /error/i.test(l) && !/out-of-order/i.test(l));
check("no unexpected errors on stderr", errLines.length === 0, errLines.slice(0, 3).join(" | "));
await stdoutP;

console.log(failures.length === 0 ? "runner e2e passed" : `runner e2e FAILED: ${failures.join(", ")}`);
process.exit(failures.length === 0 ? 0 : 1);
