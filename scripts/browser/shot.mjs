// Usage: node shot.mjs <outPrefix>   (the game must be served on http://localhost:8080)
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const out = process.argv[2] || "/home/user/.chr/s2";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({executablePath: await chromium.executablePath(), args: chromium.args, headless: true, defaultViewport: {width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true}});
const p = await b.newPage();
const errors = [];
p.on("pageerror", e => errors.push("pageerror: " + e.message));
p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
await p.goto("http://localhost:8080/", {waitUntil: "networkidle0", timeout: 60000});
await sleep(1500);
async function tapEl(sel) {
  const box = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; }, sel);
  if (!box) { errors.push("missing " + sel); return; }
  await p.mouse.click(box.x, box.y);
}
async function tapText(t) {
  const box = await p.evaluate(s => { const els = [...document.querySelectorAll("button, a, div, span")]; const e = els.reverse().find(x => x.textContent.trim().toUpperCase().includes(s) && x.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; }, t.toUpperCase());
  if (!box) { errors.push("no text " + t); return; }
  await p.mouse.click(box.x, box.y);
}
// The lobby button stays disabled until a valid player name is entered (as in the real game).
await p.click("#playerNameInput", {clickCount: 3});
await p.type("#playerNameInput", "Tester");
await sleep(300);
await tapEl("#btnStartSingleplayer");
await sleep(1200);
await p.screenshot({path: out + "-a-lobby.png"});
await tapEl("#lobbyStart");
await sleep(7000);
await p.screenshot({path: out + "-b-spawn.png"});
await p.mouse.click(195, 420);
await sleep(2500);
await p.screenshot({path: out + "-c-game.png"});
await sleep(25000);
await p.screenshot({path: out + "-d-later.png"});
console.log(JSON.stringify(errors.slice(0, 10)));
await b.close();
