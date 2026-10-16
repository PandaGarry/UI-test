// Radial menu check: taps enemy territory N times and counts how many open the menu.
// Usage: URL=http://localhost:8081/ N=80 SPOT_XY=219,418 CHROME_PATH=... node scripts/ui-tests/radial-enemy-tap.mjs
// Needs puppeteer-core (client devDependency) and @sparticuz/chromium resolvable from this folder or NODE_PATH.
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
const errors = []; p.on("pageerror", e => errors.push(String(e.stack || e.message).slice(0, 900)));
await p.goto(process.env.URL||"http://localhost:8080/", {waitUntil: "networkidle0", timeout: 60000}); await sleep(1500);
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
await p.evaluate(() => {
  window.__tl = [];
  const t0 = performance.now();
  const rr = document.querySelector("#radialRoot");
  if (rr) new MutationObserver(() => window.__tl.push([Math.round(performance.now() - t0), "radial.hidden=" + rr.hidden])).observe(rr, {attributes: true, attributeFilter: ["hidden", "style", "class"]});
  for (const ev of ["pointerdown", "pointerup", "click", "touchstart", "touchend"]) document.addEventListener(ev, e => window.__tl.push([Math.round(performance.now() - t0), ev + ":" + (e.pointerType || "") + ":" + Math.round(e.clientX ?? e.changedTouches?.[0]?.clientX ?? -1) + "," + Math.round(e.clientY ?? e.changedTouches?.[0]?.clientY ?? -1) + ":" + (e.target && e.target.id || e.target?.tagName || "")]), true);
});
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
if (process.env.SPOT_XY) { const [fx, fy] = process.env.SPOT_XY.split(",").map(Number); spot = {x: fx, y: fy}; }
console.log("SPOT " + JSON.stringify(spot));
const N = Number(process.env.N || 40);
const modes = ["quick", "hold", "icon", "touch"];
let opened = 0, notOpened = 0;
const openLatency = [];
const diagFail = [];
const tapTops = [];
const imState = [];
if (spot) for (let i = 0; i < N; i++) {
  if (await menuOpen()) { await p.mouse.click(5, 5); await sleep(150); }
  const openTouch = i % 2 === 1;
  const al0 = (await logs()).a;
  if ((await ensureList()) !== "true") await tapEl("#hudBtnAttacks");
  await sleep(150);
  const rowsPre = await rows();
  const sent0 = await sent();
  const curTop = await p.evaluate((x, y) => { const t = document.elementFromPoint(x, y); return t ? `${t.tagName}#${t.id}` : "null"; }, spot.x, spot.y);
  const curList = await p.evaluate(() => document.querySelector("#hudBtnAttacks")?.getAttribute("aria-expanded") ?? null);
  const im = await p.evaluate(() => ({touch: window.__im ? window.__im.touchPoints.size : null, moved: window.__im ? window.__im.gestureMoved : null}));
  imState.push({i, openTouch, ...im});
  const cBefore = await p.evaluate(() => ({t: window.__pTest || 0, c: window.__pClick || 0, o: window.__pOpen || 0}));
  const tOpen = Date.now();
  if (openTouch) await p.touchscreen.tap(spot.x, spot.y); else await p.mouse.click(spot.x, spot.y);
  let openedNow = false;
  while (Date.now() - tOpen < 2000) { if (await menuOpen()) { openedNow = true; break; } await sleep(15); }
  openLatency.push(Date.now() - tOpen);
  if (!openedNow) {
    const diag = await p.evaluate((x, y) => {
      const top = document.elementFromPoint(x, y);
      const d = (el) => el ? `${el.tagName}#${el.id}.${String(el.className && el.className.baseVal === undefined ? el.className : "").slice(0, 60)}` : null;
      const root = document.querySelector("#radialRoot");
      return {rootInfo: window.__pRoot || null, openErr: window.__pOpenErr || null, counters: {t: window.__pTest || 0, c: window.__pClick || 0, o: window.__pOpen || 0}, mah: window.__pLast || null, im: window.__im ? {touch: window.__im.touchPoints.size, moved: window.__im.gestureMoved, pressTarget: d(window.__im.pressTarget)} : null, tl: (window.__tl || []).slice(-6), top: d(top), topInCanvasOrHud: !!(top && top.closest && top.closest("#hud, #gameCanvas, canvas")), radialHidden: root ? root.hidden : null, radialStyle: root ? root.getAttribute("style") : null, listExpanded: document.querySelector("#hudBtnAttacks")?.getAttribute("aria-expanded") ?? null, aLen: (window.__aLog || []).length};
    }, spot.x, spot.y);
    diagFail.push({i, openTouch, cBefore, ...diag}); tapTops.push({top: curTop, list: curList, open: false});
 notOpened++; results.push({mode: "open-fail", openTouch, i}); continue; }
  opened++; tapTops.push({top: curTop, list: curList, open: true});
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
console.log("OPEN_LATENCY_MS " + JSON.stringify({n: openLatency.length, median: [...openLatency].sort((a,b)=>a-b)[Math.floor(openLatency.length/2)], max: Math.max(...openLatency)}));
{const agg = {}; for (const t of tapTops) { const k = `${t.top} list=${t.list} open=${t.open}`; agg[k] = (agg[k] || 0) + 1; } console.log("TAP_TOP " + JSON.stringify(agg)); }
console.log("IM_STATE " + JSON.stringify(imState.map(x => `${x.i}${x.openTouch ? "t" : "m"}:${x.touch}/${x.moved}`).join(" ")));
console.log("OPENFAIL_DIAG " + JSON.stringify(diagFail));
console.log("OPENFAIL " + JSON.stringify(results.filter(r => r.mode === "open-fail").map(r => r.openTouch)));
console.log("ERRORS " + JSON.stringify(errors.filter(e => !/No suitable/.test(e)).slice(0, 5)));
await b.close();
