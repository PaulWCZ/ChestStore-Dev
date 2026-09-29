// Scratch screenshots (removed after use).
import { chromium } from "playwright-core";
const [port, out, ...shots] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--lang=en-GB"] });
const id = key => "mbr_" + key + "a".repeat(26 - key.length);
for (const spec of shots) {
  const [name, path, member, locale, width, dark] = spec.split("|");
  const context = await browser.newContext({ viewport: { width: Number(width || 1280), height: 900 }, locale: locale === "fr" ? "fr-FR" : "en-GB", colorScheme: dark ? "dark" : "light", hasTouch: Number(width) < 500 });
  const origin = `http://localhost:${port}`;
  if (member && member !== "-") await context.addCookies([{ name: "dev_member", value: id(member), url: origin }, { name: "dev_locale", value: locale || "en", url: origin }]);
  const page = await context.newPage();
  await page.goto(origin + path);
  await page.waitForTimeout(600);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(name, "overflow", wide);
  await context.close();
}
await browser.close();
