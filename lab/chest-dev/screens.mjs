// Screenshots of a tool running in the harness (dev.mjs), for its docs, the
// store preview and the showcase.
//
//   node lab/chest-dev/screens.mjs <tool folder> [--port 4000]
//
// Reads <tool>/docs/screens.json:
//   [{ "name": "board", "path": "/chest", "member": "camille", "locale": "en",
//      "actions": [{"click": "text=New task"}, {"fill": ["#title", "Call Inès"]}, {"wait": 300}],
//      "preview": true }]
// and writes docs/screens/<name>-desktop.png (1440×900) and
// <name>-phone.png (390×844, 3× scale); the entry marked preview also gives
// chest/preview.png (1280×800, under 512 KiB).
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const folder = args.find(a => !a.startsWith("--"));
const portAt = args.indexOf("--port");
const port = portAt >= 0 ? Number(args[portAt + 1]) : 4000;
if (!folder || !existsSync(join(folder, "docs", "screens.json"))) {
  console.error("usage: node lab/chest-dev/screens.mjs <tool folder> [--port 4000] (with docs/screens.json)");
  process.exit(1);
}
const tool = resolve(folder);
const shots = JSON.parse(readFileSync(join(tool, "docs", "screens.json"), "utf8"));
const origin = `http://localhost:${port}`;
const executablePath = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(p => existsSync(p));
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--lang=en-GB"] });
mkdirSync(join(tool, "docs", "screens"), { recursive: true });
const id = key => "mbr_" + key + "a".repeat(26 - key.length);

async function run(page, actions = []) {
  for (const action of actions) {
    if (action.click) await page.click(action.click);
    if (action.fill) await page.fill(action.fill[0], action.fill[1]);
    if (action.press) await page.keyboard.press(action.press);
    if (action.hover) await page.hover(action.hover);
    if (action.wait) await page.waitForTimeout(action.wait);
  }
}

for (const shot of shots) {
  const sizes = [["desktop", { width: 1440, height: 900 }, 1], ["phone", { width: 390, height: 844 }, 3]];
  if (shot.preview) sizes.push(["preview", { width: 1280, height: 800 }, 1]);
  for (const [kind, viewport, scale] of sizes) {
    if (shot.only && !shot.only.includes(kind)) continue;
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: shot.dark ? "dark" : "light", locale: shot.locale === "fr" ? "fr-FR" : "en-GB", reducedMotion: "reduce" });
    await context.addCookies([
      { name: "dev_member", value: id(shot.member ?? "camille"), url: origin },
      ...(shot.locale ? [{ name: "dev_locale", value: shot.locale, url: origin }, { name: "lang", value: shot.locale, url: origin }] : []),
    ]);
    const page = await context.newPage();
    await page.goto(origin + shot.path, { waitUntil: "networkidle" });
    await run(page, shot.actions);
    await page.waitForTimeout(250);
    const file = kind === "preview" ? join(tool, "chest", "preview.png") : join(tool, "docs", "screens", `${shot.name}-${kind}.png`);
    await page.screenshot({ path: file, fullPage: false });
    await context.close();
    console.log(`${shot.name} ${kind} → ${file.slice(tool.length + 1)}`);
    if (kind === "preview" && statSync(file).size > 512 << 10) console.warn("! chest/preview.png is over 512 KiB");
  }
}
await browser.close();
