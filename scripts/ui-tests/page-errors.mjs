// Console errors, page errors and failed requests on the main menu.
// Usage: URL=http://localhost:8081/ node scripts/ui-tests/page-errors.mjs
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const URL = process.env.URL || "http://127.0.0.1:8081/";
const b = await puppeteer.launch({executablePath: await chromium.executablePath(), args: chromium.args, headless: true, defaultViewport: {width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true}});
const p = await b.newPage();
const errors = [], failed = [];
p.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text().slice(0, 240)); });
p.on("pageerror", e => errors.push("pageerror: " + String(e.message).slice(0, 240)));
p.on("requestfailed", r => failed.push(r.url().slice(0, 160) + " " + r.failure()?.errorText));
p.on("response", r => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().slice(0, 160)); });
await p.goto(URL, {waitUntil: "networkidle0", timeout: 90000});
await new Promise(r => setTimeout(r, 3000));
console.log("ERRORS", JSON.stringify([...new Set(errors)], null, 1));
console.log("FAILED", JSON.stringify([...new Set(failed)], null, 1));
await b.close();
