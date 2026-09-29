import { chromium } from "playwright-core";
// node shot.mjs out-prefix who locale path [phone]
const [, , out, who, locale, path, phone] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: "en-GB" } : { viewport: { width: 1280, height: 860 }, locale: "en-GB" });
const origin = "http://localhost:8500";
await context.addCookies([{ name: "dev_member", value: "mbr_" + who + "a".repeat(26 - who.length), url: origin }, { name: "dev_locale", value: locale, url: origin }]);
const page = await context.newPage();
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(origin + path);
await page.waitForTimeout(900);
const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
await page.screenshot({ path: out, fullPage: true });
console.log(path, who, phone ? "phone" : "desk", "scroll/inner", w.join("/"), errors.join(" | "));
await browser.close();
