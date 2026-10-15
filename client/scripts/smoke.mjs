// Browser smoke test: main menu -> lobby -> countdown -> game start, then FPS sample.
// Usage: CHROME_PATH=/path/to/chrome node scripts/smoke.mjs [--url http://127.0.0.1:8080/] [--bots 30] [--fps-seconds 5]
// Exits with code 1 on any page error, console error, or failed step.
import puppeteer from "puppeteer-core";

const arg = (name, def) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : def;
};
const url = arg("url", "http://127.0.0.1:8080/");
const bots = Number(arg("bots", "30"));
const fpsSeconds = Number(arg("fps-seconds", "5"));
const executablePath = process.env.CHROME_PATH;
if (!executablePath) {
	console.error("CHROME_PATH is not set");
	process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const fail = msg => { errors.push(msg); };

const browser = await puppeteer.launch({
	executablePath,
	headless: true,
	args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
try {
	const page = await browser.newPage();
	page.on("pageerror", e => fail(`pageerror: ${e.message}`));
	page.on("console", m => { if (m.type() === "error") fail(`console: ${m.text()}`); });
	await page.setViewport({width: 1280, height: 800});
	await page.goto(url, {waitUntil: "networkidle0"});

	// 1. Main menu
	await page.waitForSelector("#btnStartSingleplayer", {visible: true, timeout: 15000});
	console.log("ok main menu");

	// 2. Lobby
	await page.click("#btnStartSingleplayer");
	await page.waitForSelector("#lobbyStart", {visible: true, timeout: 5000});
	await page.evaluate(n => {
		const r = document.getElementById("lobbyBotsRange");
		r.value = String(n);
		r.dispatchEvent(new Event("input", {bubbles: true}));
	}, bots);
	console.log(`ok lobby (bots=${bots})`);

	// 3. Countdown: start, cancel, start again, wait for game
	await page.click("#lobbyStart");
	await sleep(1000);
	const counting = await page.$eval("#lobbyStart", el => el.classList.contains("is-counting"));
	if (!counting) fail("countdown did not start");
	await page.click("#lobbyStart"); // cancel
	await sleep(500);
	const cancelled = await page.$eval("#lobbyStart", el => !el.classList.contains("is-counting"));
	if (!cancelled) fail("countdown did not cancel");
	await page.click("#lobbyStart");
	// Game is running when the HUD is visible and the lobby is hidden (checked via ancestors too).
	await page.waitForFunction(() => document.getElementById("GameHudContainer").checkVisibility()
		&& !document.getElementById("LobbyCreateContainer").checkVisibility(), {timeout: 20000});
	console.log("ok countdown and game start");

	// 4. FPS sample in game
	await sleep(1500);
	const fps = await page.evaluate(ms => new Promise(resolve => {
		let frames = 0;
		const t0 = performance.now();
		const tick = () => {
			frames++;
			if (performance.now() - t0 < ms) requestAnimationFrame(tick);
			else resolve(frames / ((performance.now() - t0) / 1000));
		};
		requestAnimationFrame(tick);
	}), fpsSeconds * 1000);
	console.log(`fps ${fps.toFixed(1)} over ${fpsSeconds}s (headless, software GL, not representative of a GPU)`);
} catch (e) {
	fail(`step failed: ${e.message}`);
} finally {
	await browser.close();
}

if (errors.length) {
	console.error(errors.join("\n"));
	process.exit(1);
}
console.log("smoke passed");
