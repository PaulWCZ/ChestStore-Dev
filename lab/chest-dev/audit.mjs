// Accessibility audit of a tool running in the harness (dev.mjs): every
// screen of its docs/screens.json — the page, then its "actions" replayed
// like screens.mjs does, so a state behind a click (a dialog, a form) is
// checked too — at desktop and phone width (or the sizes its "only" names),
// light and dark, with axe-core (WCAG 2.1 A and AA rules) — in the company's
// look a screen names ("look", as screens.mjs), so every theme is audited
// on the tool's real pages. A lab tool:
// axe-core is never part of a tool.
//
//   node lab/chest-dev/audit.mjs <tool folder> [--port 4000]
//
// Prints each rule broken, where, and exits 1 when one is found.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const folder = args.find(a => !a.startsWith("--"));
const portAt = args.indexOf("--port");
const port = portAt >= 0 ? Number(args[portAt + 1]) : 4000;
if (!folder || !existsSync(join(folder, "docs", "screens.json"))) {
  console.error("usage: node lab/chest-dev/audit.mjs <tool folder> [--port 4000] (with docs/screens.json)");
  process.exit(1);
}
// "language" (SDK 0.3.0's word) or "locale" (its former name), as screens.mjs.
const shots = JSON.parse(readFileSync(join(resolve(folder), "docs", "screens.json"), "utf8")).map(shot => ({ ...shot, locale: shot.language ?? shot.locale }));
// The harness's two hosts (dev.mjs): https, self-signed (cert.mjs).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const origin = `https://127.0.0.1:${port}`;
const publicOrigin = `https://localhost:${port + 2}`;
const axe = require.resolve("axe-core/axe.min.js");
const executablePath = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(p => existsSync(p));
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--lang=en-GB"] });
const id = key => "mbr_" + key + "a".repeat(26 - key.length);
const found = new Map();
const unreached = [];

async function run(page, actions = []) {
  for (const action of actions) {
    if (action.click) await page.click(action.click, { timeout: 10_000 });
    if (action.fill) await page.fill(action.fill[0], action.fill[1], { timeout: 10_000 });
    if (action.upload) await page.setInputFiles(action.upload[0], resolve(folder, action.upload[1]));
    if (action.press) await page.keyboard.press(action.press);
    if (action.hover) await page.hover(action.hover, { timeout: 10_000 });
    if (action.wait) await page.waitForTimeout(action.wait);
  }
}

// The same page in the same state is audited once, whatever its name.
const seen = new Set();
const screens = shots.filter(shot => {
  const key = `${shot.path}|${shot.member ?? ""}|${shot.locale ?? ""}|${JSON.stringify(shot.actions ?? [])}|${JSON.stringify(shot.look ?? null)}`;
  return seen.has(key) ? false : (seen.add(key), true);
});
const label = shot => (shot.actions?.length || shot.look ? `${shot.path} → ${shot.name}` : shot.path);
const looks = shots.some(shot => shot.look);
async function setLook(level, choice) {
  const answer = await fetch(`${origin}/_dev/theme`, { method: "POST", body: new URLSearchParams({ level, choice }), redirect: "manual" });
  if (answer.status !== 303) throw new Error(`the harness refused the look ${level}=${choice} (${answer.status})`);
}

for (const shot of screens) {
  if (looks) {
    await setLook("all", shot.look?.all ?? "own");
    await setLook("tool", shot.look?.tool ?? "inherit");
  }
  for (const [kind, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    if (shot.only && !shot.only.includes(kind)) continue;
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, bypassCSP: true, viewport, colorScheme: scheme, locale: shot.locale === "fr" ? "fr-FR" : "en-GB", reducedMotion: "reduce" });
      await context.addCookies([
        { name: "dev_member", value: id(shot.member ?? "camille"), url: origin },
        ...(shot.locale ? [{ name: "dev_locale", value: shot.locale, url: origin }, { name: "lang", value: shot.locale, url: origin }, { name: "lang", value: shot.locale, url: publicOrigin }] : []),
      ]);
      const page = await context.newPage();
      await page.goto((/^\/chest(\/|\?|$)/iu.test(shot.path) ? origin : publicOrigin) + shot.path, { waitUntil: "load" });
    // Network idle, or 5 s: a file the Chest's front refuses (sent to the
    // other host, then blocked by the CSP) never lets Chromium call the
    // network idle — the front's log says which.
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => console.warn(`! ${shot.path}: the network never went idle (see /_dev/logs for files the front refused)`));
      try {
        await run(page, shot.actions);
      } catch (error) {
        unreached.push(`${label(shot)} (${kind} ${scheme}): ${String(error.message).split("\n")[0]}`);
        await context.close();
        continue;
      }
      await page.waitForTimeout(200);
      await page.addScriptTag({ path: axe });
      const result = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
      });
      for (const v of result) {
        const key = `${v.id}|${label(shot)}`;
        if (!found.has(key)) found.set(key, { ...v, path: label(shot), where: new Set() });
        found.get(key).where.add(`${kind} ${scheme}`);
      }
      await context.close();
    }
  }
}
if (looks) {
  await setLook("all", "own");
  await setLook("tool", "inherit");
}
await browser.close();
for (const line of unreached) console.log(`✗ could not reach the screen: ${line}`);
if (found.size === 0 && unreached.length === 0) {
  console.log(`✓ no WCAG A/AA rule broken on ${screens.length} screens (desktop, phone, light, dark)`);
  process.exit(0);
}
for (const v of found.values()) console.log(`✗ ${v.impact} ${v.id} — ${v.help}\n  ${v.path} (${[...v.where].join(", ")})\n  ${v.targets.join("\n  ")}`);
process.exit(1);
