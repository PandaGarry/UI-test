// Land attack test (v1): spawn next to bots (400), then tap enemy land (any part, not only the border),
// press the ring's attack button, and count: menu opened / attack enabled / attack accepted / silent no-op.
// Run: cd /home/user/chrtest && LD_LIBRARY_PATH=/tmp/al2023/lib node land.mjs
// Env: BOTS (400), TAPS (120)
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BOTS = Number(process.env.BOTS || 400), TAPS = Number(process.env.TAPS || 120);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({executablePath: await chromium.executablePath(), args: chromium.args, headless: true, defaultViewport: {width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true}});
const p = await b.newPage();
const errors = []; p.on("pageerror", e => errors.push(e.message));
await p.goto("http://localhost:8081/", {waitUntil: "networkidle0", timeout: 60000}); await sleep(1500);
const tapEl = async sel => { const box = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; }, sel); if (box) await p.mouse.click(box.x, box.y); };
const timerOn = () => p.evaluate(() => { const e = document.querySelector("#spawnPhaseTimer"); return !!e && e.style.display !== "none"; });
await p.click("#playerNameInput", {clickCount: 3}); await p.type("#playerNameInput", "Tester"); await sleep(300);
await tapEl("#btnStartSingleplayer"); await sleep(1200);
await p.click("#lobbyBotsNumber", {clickCount: 3}); await p.type("#lobbyBotsNumber", String(BOTS));
await p.evaluate(() => { const i = document.getElementById("lobbyBotsNumber"); i.dispatchEvent(new Event("input", {bubbles: true})); i.dispatchEvent(new Event("change", {bubbles: true})); i.blur(); });
await sleep(400);
await tapEl("#lobbyStart");
const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await timerOn())) await sleep(100);
// spawn: try points in the Balkans/Turkey area where bots are; in local games the last valid pick stays
if (process.env.SPAWN) { const [sx, sy] = process.env.SPAWN.split(',').map(Number); await p.mouse.click(sx, sy); await sleep(300); } else for (let y = 320; y <= 462; y += 12) for (let x = 40; x <= 340; x += 12) { await p.mouse.click(x, y); await sleep(30); }
const w0 = Date.now(); while (Date.now() - w0 < 30000 && await timerOn()) await sleep(200);
await sleep(1000);
await p.screenshot({path: "/home/user/screenshots/our-game/land-after-spawn.png"});
console.log("CLOCK " + await p.evaluate(() => document.querySelector("#gameClock")?.textContent) + " TROOPS " + await p.evaluate(() => document.querySelector("#hudSendCount")?.textContent));
await tapEl("#hudBtnAttacks"); await sleep(200);
const rowsText = () => p.evaluate(() => [...document.querySelectorAll("#hudAttackList .hud-attack-item")].map(e => e.textContent.replace(/[×]/g, "").trim()).join(" | "));
const menuOpen = () => p.evaluate(() => { const r = document.querySelector("#radialRoot"); return !!r && !r.hidden; });
const atkEnabled = () => p.evaluate(() => { const d = document.querySelector('.radial-sector[data-id="attack"]'); return d ? !d.classList.contains("is-disabled") : null; });
const centre = () => p.evaluate(() => { const c = document.querySelector(".radial-center"); if (!c) return null; const r = c.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; });
const pts = [];
for (let y = 320; y <= 462; y += 7) for (let x = 30; x <= 345; x += 9) pts.push([x, y]);
// shuffle so repeated taps do not all land in one place
for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
const stats = {taps: 0, opened: 0, enabled: 0, accepted: 0, silent: 0, enemyRows: 0};
const silentAt = [];
let enemyNames = new Set();
for (let i = 0; i < Math.min(TAPS, pts.length); i++) {
  const [x, y] = pts[i];
  stats.taps++;
  const before = await rowsText();
  await p.mouse.click(x, y); await sleep(170);
  if (!(await menuOpen())) continue;
  stats.opened++;
  const en = await atkEnabled();
  if (en) stats.enabled++;
  const c = await centre();
  if (c) { await p.mouse.click(c.x, c.y); await sleep(220); }
  const after = await rowsText();
  if (en && after !== before) stats.accepted++;
  if (en && after === before) { stats.silent++; await sleep(1500); if ((await p.evaluate(() => document.querySelector("#hudBtnAttacks").getAttribute("aria-expanded"))) !== "true") await tapEl("#hudBtnAttacks"); await sleep(400); const late = await rowsText(); const d0 = await p.evaluate(() => Object.assign({}, window.__atkDbg || {}, {tick: window.__atkTick || null, listHidden: document.querySelector("#hudAttackList")?.hidden, listHtml: (document.querySelector("#hudAttackList")?.innerHTML || "").slice(0, 160), expanded: document.querySelector("#hudBtnAttacks")?.getAttribute("aria-expanded")})); const d = Object.assign({}, d0, {lateRows: late}); stats.lateChanged = (stats.lateChanged || 0) + (late !== before ? 1 : 0); silentAt.push({at: [x, y], dbg: d, sentAt: d ? d.t : null, troops: await p.evaluate(() => document.querySelector('#hudSendCount')?.textContent)}); }
  for (const m of after.matchAll(/↑\s*[\d.]+K?\s*([^|]+)/g)) if (!/Пустошь/.test(m[1])) { stats.enemyRows++; enemyNames.add(m[1].trim()); }
  if (await menuOpen()) { await p.mouse.click(5, 5); await sleep(150); }
}
console.log("STATS " + JSON.stringify(stats));
console.log("ENEMY_TARGETS " + JSON.stringify([...enemyNames].slice(0, 10)));
for (const r of silentAt.slice(0, 8)) console.log("SILENT " + JSON.stringify(r));
console.log("ERRORS " + JSON.stringify(errors.slice(0, 3)));
await b.close();
