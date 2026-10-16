// Smoke test: starts headless Chromium (npm @sparticuz/chromium) and renders a page.
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({executablePath: await chromium.executablePath(), args: chromium.args, headless: true});
const page = await browser.newPage();
await page.setContent("<h1>ok</h1>");
console.log("chromium smoke:", await page.$eval("h1", e => e.textContent));
await browser.close();
