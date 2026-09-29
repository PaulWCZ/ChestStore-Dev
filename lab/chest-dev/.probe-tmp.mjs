import { chromium } from "playwright-core";
const [port, member, locale, ...paths] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const w of [390, 1280]) {
  const c = await b.newContext({ viewport: { width: w, height: 844 }, locale: "en-GB" });
  const o = `http://localhost:${port}`;
  await c.addCookies([{ name: "dev_member", value: "mbr_" + member + "a".repeat(26 - member.length), url: o }, { name: "dev_locale", value: locale, url: o }]);
  const p = await c.newPage(); let errs = [];
  p.on("pageerror", e => errs.push(e.message.slice(0, 80)));
  for (const path of paths) { errs = []; await p.goto(o + path); await p.waitForTimeout(800); console.log(w, path, errs.length ? errs : "ok"); }
  await c.close();
}
await b.close();
