import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "en-GB" });
const origin = "http://localhost:8500";
await context.addCookies([{ name: "dev_member", value: "mbr_camilleaaaaaaaaaaaaaaaaaaa", url: origin }]);
const page = await context.newPage();
await page.goto(origin + "/chest/polls/2");
console.log(await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth, document.documentElement.clientWidth, visualViewport.scale])); console.log(await page.evaluate(() => {
  const out = [];
  let e = document.querySelector(".grid-table");
  while (e) { const r = e.getBoundingClientRect(); out.push(e.tagName + "." + (e.className || "") + " w=" + Math.round(r.width) + " minw=" + getComputedStyle(e).minWidth + " ov=" + getComputedStyle(e).overflowX); e = e.parentElement; }
  return out.join("\n");
}));
await browser.close();
