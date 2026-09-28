// Accessibility audit of a tool running in the harness (dev.mjs): every
// page of its docs/screens.json, at desktop and phone width, light and dark,
// checked with axe-core (WCAG 2.1 A and AA rules). A lab tool: axe-core is
// never part of a tool.
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
const shots = JSON.parse(readFileSync(join(resolve(folder), "docs", "screens.json"), "utf8"));
const origin = `http://localhost:${port}`;
const axe = require.resolve("axe-core/axe.min.js");
const executablePath = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(p => existsSync(p));
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--lang=en-GB"] });
const id = key => "mbr_" + key + "a".repeat(26 - key.length);
const found = new Map();

for (const shot of shots) {
  for (const [kind, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport, colorScheme: scheme, locale: shot.locale === "fr" ? "fr-FR" : "en-GB", reducedMotion: "reduce" });
      await context.addCookies([
        { name: "dev_member", value: id(shot.member ?? "camille"), url: origin },
        ...(shot.locale ? [{ name: "dev_locale", value: shot.locale, url: origin }, { name: "lang", value: shot.locale, url: origin }] : []),
      ]);
      const page = await context.newPage();
      await page.goto(origin + shot.path, { waitUntil: "networkidle" });
      await page.waitForTimeout(200);
      await page.addScriptTag({ path: axe });
      const result = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
      });
      for (const v of result) {
        const key = `${v.id}|${shot.path}`;
        if (!found.has(key)) found.set(key, { ...v, path: shot.path, where: new Set() });
        found.get(key).where.add(`${kind} ${scheme}`);
      }
      await context.close();
    }
  }
}
await browser.close();
if (found.size === 0) {
  console.log(`✓ no WCAG A/AA rule broken on ${shots.length} pages (desktop, phone, light, dark)`);
  process.exit(0);
}
for (const v of found.values()) console.log(`✗ ${v.impact} ${v.id} — ${v.help}\n  ${v.path} (${[...v.where].join(", ")})\n  ${v.targets.join("\n  ")}`);
process.exit(1);
