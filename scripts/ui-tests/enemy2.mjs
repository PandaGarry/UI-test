// Enemy-tap test (v1): spawn, then tap ENEMY territory (not own, not water). For each tap record the
// full chain: tap -> radial menu (owner, attack enabled) -> press mode -> attackAction branch -> outgoing row.
// Press modes cycle: "quick" centre click, "hold" centre press 300 ms, "icon" click on the attack icon.
// Env: BOTS (400), TAPS (90), SPAWN ("x,y" optional)
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const BOTS = Number(process.env.BOTS || 400), TAPS = Number(process.env.TAPS || 90);
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
await sleep(400); await tapEl("#lobbyStart");
const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await timerOn())) await sleep(100);
if (process.env.SPAWN) { const [sx, sy] = process.env.SPAWN.split(",").map(Number); await p.mouse.click(sx, sy); await sleep(300); }
else for (let y = 320; y <= 462; y += 12) for (let x = 40; x <= 340; x += 12) { await p.mouse.click(x, y); await sleep(30); }
const w0 = Date.now(); while (Date.now() - w0 < 30000 && await timerOn()) await sleep(200);
await sleep(1000);
await tapEl("#hudBtnAttacks"); await sleep(200);
const rows = () => p.evaluate(() => [...document.querySelectorAll("#hudAttackList .hud-attack-item")].map(e => e.textContent.replace(/[×]/g, "").trim()).join(" | "));
const ensureList = () => p.evaluate(() => { const b = document.querySelector("#hudBtnAttacks"); return b.getAttribute("aria-expanded"); });
const menuOpen = () => p.evaluate(() => { const r = document.querySelector("#radialRoot"); return !!r && !r.hidden; });
const centre = () => p.evaluate(() => { const c = document.querySelector(".radial-center"); const r = c.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; });
const attackOnDom = () => p.evaluate(() => { const d = document.querySelector('.radial-sector[data-id="attack"]'); return d ? !d.classList.contains("is-disabled") : null; });
const attackIcon = () => p.evaluate(() => { const bs = [...document.querySelectorAll(".radial-icon")]; const e = bs.find(x => /Атак/.test(x.title)); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: e.classList.contains("is-disabled")}; });
const logs = () => p.evaluate(() => ({a: (window.__aLog || []).length, r: (window.__rLog || []).length}));
const lastR = () => p.evaluate(() => (window.__rLog || []).slice(-1)[0] || null);
const lastA = (n) => p.evaluate(k => (window.__aLog || []).slice(k), n);
// enemy tiles in the spawn area: we only know them from the map by tapping; use a grid and keep enemy hits
const pts = [];
for (let y = 320; y <= 462; y += 7) for (let x = 30; x <= 345; x += 9) pts.push([x, y]);
for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
await p.evaluate(() => { window.__sent = 0; window.addEventListener('arena:attack-sent', () => { window.__sent++; }); });
const sent = () => p.evaluate(() => window.__sent);
const results = [];
// 1) find one enemy border tile: a tap that opens the ring with attack enabled and an enemy/neutral owner
let spot = null;
for (const [x, y] of pts) {
  if (await menuOpen()) { await p.mouse.click(5, 5); await sleep(150); }
  await p.mouse.click(x, y); await sleep(170);
  if (!(await menuOpen())) continue;
  const on = await attackOnDom();
  await p.mouse.click(5, 5); await sleep(150);
  if (on) { spot = {x, y}; break; }
}
console.log("SPOT " + JSON.stringify(spot));
const N = Number(process.env.N || 40);
const modes = ["quick", "hold", "icon", "touch"];
let opened = 0, notOpened = 0;
if (spot) for (let i = 0; i < N; i++) {
  if (await menuOpen()) { await p.mouse.click(5, 5); await sleep(150); }
  const openTouch = i % 2 === 1;
  const al0 = (await logs()).a;
  if ((await ensureList()) !== "true") await tapEl("#hudBtnAttacks");
  await sleep(150);
  const rowsPre = await rows();
  const sent0 = await sent();
  if (openTouch) await p.touchscreen.tap(spot.x, spot.y); else await p.mouse.click(spot.x, spot.y);
  await sleep(170);
  if (!(await menuOpen())) { notOpened++; results.push({mode: "open-fail", openTouch, i}); continue; }
  opened++;
  await sleep(400);
  const ghost = (await sent()) - sent0;
  if (ghost > 0) results.push({mode: "ghost-on-open", openTouch, i});
  const r = {owner: null, attackOn: await attackOnDom()};
  const mode = modes[Math.floor(i / 2) % 4];
  const sentBefore = await sent();
  if (mode === "icon") { const ic = await attackIcon(); if (ic) await p.mouse.click(ic.x, ic.y); }
  else if (mode === "touch") { const c = await centre(); await p.touchscreen.tap(c.x, c.y); }
  else { const c = await centre(); await p.mouse.move(c.x, c.y); await p.mouse.down(); if (mode === "hold") await sleep(300); await p.mouse.up(); }
  await sleep(400);
  const sentNow = (await sent()) - sentBefore;
  results.push({mode, openTouch, attackOn: r.attackOn, sentDelta: sentNow, ok: sentNow > 0});
  if (await menuOpen()) { await p.mouse.click(5, 5); await sleep(150); }
}
const summary = {opened, notOpened, ghostOnOpen: results.filter(r => r.mode === "ghost-on-open").length};
for (const m of modes) {
  const rs = results.filter(r => r.mode === m);
  summary[m] = {n: rs.length, sentWhenEnabled: rs.filter(r => r.attackOn && r.ok).length, enabled: rs.filter(r => r.attackOn).length, disabledTapsNoSend: rs.filter(r => !r.attackOn && !r.ok).length, silentWhenEnabled: rs.filter(r => r.attackOn && !r.ok).length};
}
console.log("SUMMARY " + JSON.stringify(summary));
console.log("SILENT " + JSON.stringify(results.filter(r => r.attackOn && !r.ok && r.mode !== "open-fail" && r.mode !== "ghost-on-open")));
console.log("GHOST " + JSON.stringify(results.filter(r => r.mode === "ghost-on-open")));
console.log("OPENFAIL " + JSON.stringify(results.filter(r => r.mode === "open-fail").map(r => r.openTouch)));
console.log("ERRORS " + JSON.stringify(errors.filter(e => !/No suitable/.test(e)).slice(0, 5)));
await b.close();
