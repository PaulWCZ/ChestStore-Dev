// Opens gallery/components.html in Chromium (playwright-core and axe-core from
// lab/chest-dev): no hydration mismatch, no console error, no request leaving
// the page, axe (WCAG 2.1 A/AA) clean in every look, mode and language, no
// sideways scroll at 390 px; screenshots in the system's temp folder.
//   npm run gallery && node scripts/gallery/check-page.mjs
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../lab/chest-dev/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const axePath = require.resolve("axe-core/axe.min.js");
const out = (await import("node:fs")).mkdtempSync((await import("node:os")).tmpdir() + "/chest-ui-gallery-");
console.log("screenshots in", out);
const browser = await chromium.launch((await import("node:fs")).existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" } : {});
const url = new URL("../../gallery/components.html", import.meta.url).href;
const problems = [];
async function open(width, opts = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, ...opts });
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") problems.push(`console ${m.type()}: ${m.text()}`); });
  page.on("pageerror", e => problems.push("pageerror: " + e.message));
  page.on("request", r => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) problems.push("network: " + r.url()); });
  await page.goto(url);
  await page.waitForTimeout(400);
  return page;
}
const page = await open(1440);
const hydration = await page.evaluate(() => window.__hydration);
console.log("hydration:", hydration);
if (hydration.length) problems.push(...hydration);
await page.addScriptTag({ path: axePath });
for (const theme of ["chest", "workshop", "library", "brand"]) for (const mode of ["l", "d"]) for (const lang of ["en", "fr"]) {
  await page.click(`[data-theme="${theme}"]`); if (theme !== "chest") await page.click(`[data-mode="${mode}"]`); await page.click(`[data-lang="${lang}"]`);
  const r = await page.evaluate(async () => { const res = await axe.run(document.getElementById("stage"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }); return res.violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map(n => n.target.join(" ") + " — " + (n.failureSummary || "").split("\n").slice(1, 2).join("")).join(" | ")}`); });
  if (r.length) { console.log(theme, mode, lang, r); problems.push(`axe ${theme} ${mode} ${lang}`); }
  // Avatar stacks: no face covers the initials of the one before it (the
  // next face and its 2 px ring stay right of the letters), at every size.
  const cropped = await page.evaluate(() => [...document.querySelectorAll(".ck-stack")].filter(stack => stack.offsetParent !== null).flatMap(stack => {
    const faces = [...stack.children];
    return faces.slice(0, -1).flatMap((face, i) => {
      if (!face.firstChild || face.firstChild.nodeType !== Node.TEXT_NODE) return [];
      const range = document.createRange(); range.selectNodeContents(face);
      const letters = range.getBoundingClientRect().right;
      const next = faces[i + 1].getBoundingClientRect().left - 2;
      return letters > next ? [`${stack.className} "${face.textContent}" ${letters.toFixed(1)} > ${next.toFixed(1)}`] : [];
    });
  }));
  if (cropped.length) { console.log(theme, mode, lang, "cropped initials", cropped); problems.push(`avatar stack crops initials ${theme} ${mode} ${lang}`); }
}
await page.click('[data-theme="workshop"]'); await page.click('[data-mode="l"]'); await page.click('[data-lang="en"]');
await page.locator("#bench-en .demo-stacks").screenshot({ path: `${out}/avatar-stacks.png` });
await page.click('[data-theme="workshop"]'); await page.click('[data-mode="l"]'); await page.click('[data-lang="en"]');
await page.screenshot({ path: `${out}/desk-workshop-en.png`, fullPage: true });
await page.click('[data-theme="brand"]'); await page.click('[data-mode="d"]'); await page.click('[data-lang="fr"]');
await page.screenshot({ path: `${out}/desk-brand-dark-fr.png`, fullPage: true });
await page.click('[data-theme="chest"]'); await page.click('[data-lang="en"]');
await page.screenshot({ path: `${out}/desk-chest-en.png`, fullPage: true });
const phone = await open(390, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await phone.click('[data-theme="library"]'); await phone.click('[data-lang="fr"]');
await phone.screenshot({ path: `${out}/phone-library-fr.png`, fullPage: true });
const sw = await phone.evaluate(() => document.documentElement.scrollWidth);
console.log("phone scrollWidth", sw);
if (sw > 390) problems.push("sideways scroll on a phone");
// Nothing of the header lies past the screen's edge, not even what is read
// and not shown (the member's name sat past it until 0.2.2, Quotes).
const past = await phone.evaluate(() => [...document.querySelectorAll(".ck-bar, .ck-bar *")].filter(e => e.getClientRects().length > 0).map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.right > window.innerWidth + 0.5 || r.left < -0.5).map(([e, r]) => `${e.tagName.toLowerCase()}.${e.className} ${Math.round(r.left)}–${Math.round(r.right)}`));
console.log("phone header past the edge:", past);
if (past.length) problems.push("the header reaches past a phone's edge: " + past.join(", "));
// Five sections with counts on a phone: a count never covers its icon (Expenses).
const covered = await phone.evaluate(() => [...document.querySelectorAll(".ck-nav-link")].filter(a => a.querySelector(".ck-count") && a.querySelector(".ck-nav-icon") && a.offsetParent !== null).filter(a => {
  const c = a.querySelector(".ck-count").getBoundingClientRect(), i = a.querySelector(".ck-nav-icon svg").getBoundingClientRect();
  return c.left < i.right - 1 && c.bottom > i.top + 1 && c.top < i.bottom - 1 && c.right > i.left + 1 && (c.left < i.left + i.width * 0.75);
}).map(a => a.textContent));
if (covered.length) problems.push("a nav count covers its icon: " + covered.join(", "));
// Every control is a 44 px target (brief/05; 0.2.2): its box, or an
// invisible margin that answers the pointer 22 px around its centre.
for (const [label, p] of [["desk", page], ["phone", phone]]) {
  const small = await p.evaluate(() => {
    const controls = [...document.querySelectorAll("#stage :is(button, a[href], select, input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]), [role=tab], [role=menuitem], label.ck-segment, label.ck-switch-label)")]
      .filter(e => e.offsetParent !== null && !e.closest(".ck-vh, .demo-intro, .demo-note, .spec-k, [inert], [aria-hidden=true], .ck-sort-none") && getComputedStyle(e).visibility !== "hidden");
    // A picker's field is the whole box around it (a press anywhere in it focuses the field).
    const own = e => e.closest(".ck-picker-box") ?? e;
    const hits = (e, x, y) => { const at = document.elementFromPoint(x, y); return at !== null && (own(e).contains(at) || at.contains(e)); };
    return controls.filter(e => {
      if (e.getBoundingClientRect().height >= 43.5) return false;
      e.scrollIntoView({ block: "center", inline: "nearest" });
      const r = e.getBoundingClientRect();
      if (r.width === 0) return false;
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1), cy = r.top + r.height / 2;
      return !(hits(e, cx, cy - 21.5) && hits(e, cx, cy + 21.5));
    }).map(e => `${e.tagName.toLowerCase()}.${e.className || e.getAttribute("role") || ""} "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().height)}px`);
  });
  console.log(label, "targets under 44 px:", small);
  if (small.length) problems.push(`${label}: targets under 44 px: ${small.join(" | ")}`);
}
console.log("problems:", problems);
if (problems.length || (await Promise.resolve(0))) process.exitCode = 1;
await browser.close();
