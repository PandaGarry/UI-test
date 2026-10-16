// Bottom panel + attack notices test (v1). Numbers, not eyeballs. Saves a crop of the bottom area.
// Run: cd /home/user/chrtest && LD_LIBRARY_PATH=/home/user/chrtest/al/lib node bottom.mjs
// Checks:
//  B1 every attack notice has the same width (176 px CSS) whatever the troop count
//  B2 troop cells have the same width and the names start at the same x in each column
//  B3 nothing overlaps: troop number stays inside its pill; sword/percent block does not cover the pill
//  B4 no padlock elements left in the bottom row
//  B5 no page errors
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = "/home/user/screenshots/our-game";
fs.mkdirSync(OUT, {recursive: true});
const results = [];
const check = (id, ok, detail) => { results.push({id, ok, detail}); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail}`); };
const b = await puppeteer.launch({executablePath: await chromium.executablePath(), args: chromium.args, headless: true, defaultViewport: {width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true}});
const p = await b.newPage();
const errors = []; p.on("pageerror", e => errors.push(e.message));
await p.goto("http://localhost:8081/", {waitUntil: "networkidle0", timeout: 60000}); await sleep(1500);
const tapEl = async sel => { const box = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; }, sel); if (box) await p.mouse.click(box.x, box.y); };
const timerOn = () => p.evaluate(() => { const e = document.querySelector("#spawnPhaseTimer"); return !!e && e.style.display !== "none"; });
await p.click("#playerNameInput", {clickCount: 3}); await p.type("#playerNameInput", "Tester"); await sleep(300);
await tapEl("#btnStartSingleplayer"); await sleep(1200); await tapEl("#lobbyStart");
const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await timerOn())) await sleep(100);
await p.mouse.click(210, 425); await sleep(900);
const w0 = Date.now(); while (Date.now() - w0 < 30000 && await timerOn()) await sleep(200);
await sleep(1000);
await tapEl("#hudBtnAttacks"); await sleep(200);
// several attacks on land near the spawn: different troop counts, different name lengths
const spots = [[300, 380], [340, 400], [260, 360], [320, 350], [280, 420], [350, 330]];
for (const [x, y] of spots) {
  await p.mouse.click(x, y); await sleep(200);
  const c = await p.evaluate(() => { const c = document.querySelector(".radial-center"); if (!c) return null; const r = c.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; });
  if (c) { await p.mouse.click(c.x, c.y); await sleep(250); }
  if (await p.evaluate(() => { const r = document.querySelector("#radialRoot"); return !!r && !r.hidden; })) { await p.mouse.click(5, 5); await sleep(150); }
}
await sleep(400);
// Layout check with two notices of very different lengths (the game merges neutral attacks into one row,
// so a second real row needs a bot border). Same markup as GameHud.attackRow.
const m = await p.evaluate(() => {
  const list = document.querySelector("#hudAttackList");
  const row = (dir, t, n) => `<div class="hud-attack-item hud-attack-item-${dir}"><span class="hud-attack-item-troops">${dir === "out" ? "↑" : "↓"} ${t}</span><span class="hud-attack-item-name">${n}</span><button class="hud-attack-cancel">×</button></div>`;
  list.innerHTML = row("out", "1.90K", "Пустошь") + row("in", "13.50K", "Республики кхмеров длинное имя");
  const items = [...document.querySelectorAll("#hudAttackList .hud-attack-item")];
  const r = items.map(e => { const b = e.getBoundingClientRect(); const t = e.querySelector(".hud-attack-item-troops").getBoundingClientRect(); const n = e.querySelector(".hud-attack-item-name").getBoundingClientRect(); return {w: b.width, col: Math.round(b.x), tw: t.width, nx: Math.round(n.x - b.x), txt: e.textContent.replace(/[×⚔]/g, "").trim()}; });
  const pill = document.querySelector(".hud-troop-pill")?.getBoundingClientRect();
  const send = document.querySelector("#hudSendCount")?.getBoundingClientRect();
  const att = document.querySelector(".hud-attack-block")?.getBoundingClientRect();
  return {items: r, pill: pill && {l: pill.left, r: pill.right}, send: send && {l: send.left, r: send.right}, att: att && {l: att.left, r: att.right}, locks: document.querySelectorAll(".hud-lock:not([style*='none'])").length};
});
console.log("ITEMS " + JSON.stringify(m.items));
if (m.items.length < 2) check("B1", false, `only ${m.items.length} notices shown, need 2+`);
else {
  const widths = [...new Set(m.items.map(i => Math.round(i.w)))];
  check("B1", widths.length === 1 && widths[0] === 176, `widths=${JSON.stringify(widths)} (need one value, 176)`);
  const tws = [...new Set(m.items.map(i => Math.round(i.tw)))];
  const nxs = [...new Set(m.items.map(i => i.nx))];
  check("B2", tws.length === 1 && nxs.length === 1, `troop cell widths=${JSON.stringify(tws)} name offsets=${JSON.stringify(nxs)}`);
}
if (m.pill && m.send) {
  const inside = m.send.r <= m.pill.r && m.send.l >= m.pill.l;
  const covered = m.att && m.att.l < m.pill.r - 2 && m.att.r > m.pill.r - 40;
  check("B3", inside, `troop number inside pill=${inside} (send ${Math.round(m.send.r)} vs pill ${Math.round(m.pill.r)}); attack block over pill end=${!!covered}`);
} else check("B3", false, "pill or troop count not found");
const foot = await p.evaluate(() => {
  const f = document.querySelector(".hud-dock-row")?.getBoundingClientRect();
  const pill = document.querySelector(".hud-troop-pill");
  const pr = pill?.getBoundingClientRect();
  const within = (el, box, tol = 1) => { if (!el || !box) return false; const r = el.getBoundingClientRect(); return r.left >= box.left - tol && r.right <= box.right + tol && r.top >= box.top - tol && r.bottom <= box.bottom + tol; };
  const kids = [document.querySelector(".hud-gold-pill"), pill, document.querySelector(".hud-attack-block")].filter(Boolean);
  const outside = kids.filter(k => !within(k, f)).map(k => k.className);
  const inner = ["#hudSendCount", "#hudTroopRate", "#selectorTroopCount"].map(s => document.querySelector(s)).filter(Boolean);
  const innerOut = inner.filter(e => !within(e, pr)).map(e => e.id);
  return {footBottom: f ? Math.round(f.bottom) : null, vh: window.innerHeight, outside, innerOut, overflow: pill ? pill.scrollWidth - pill.clientWidth : null, gold: document.querySelector("#hudGold")?.textContent};
});
console.log("FOOT " + JSON.stringify(foot));
check("B6", foot.outside.length === 0, `elements outside the footer: ${JSON.stringify(foot.outside)}`);
check("B7", foot.innerOut.length === 0 && (foot.overflow ?? 0) <= 1, `troop texts outside the pill: ${JSON.stringify(foot.innerOut)}, overflow=${foot.overflow}px`);
check("B8", foot.footBottom !== null && Math.abs(foot.vh - foot.footBottom) <= 1, `footer bottom=${foot.footBottom} viewport=${foot.vh} (no gap under the footer)`);
check("B9", foot.gold === "0", `gold shows "${foot.gold}" (need "0")`);
check("B4", m.locks === 0, `padlock elements visible=${m.locks}`);
const shotBox = await p.evaluate(() => { const r = document.querySelector(".hud-action-row")?.getBoundingClientRect() || {top: 560, height: 40}; return {y: Math.max(0, r.top - 180), h: 260}; });
await p.screenshot({path: `${OUT}/bottom-test.png`, clip: {x: 0, y: shotBox.y, width: 390, height: shotBox.h}});
check("B5", errors.length === 0, `page errors=${errors.length} ${errors.slice(0, 2).join(" | ")}`);
await b.close();
console.log(results.every(r => r.ok) ? "ALL PASS" : "SOME FAILED");
