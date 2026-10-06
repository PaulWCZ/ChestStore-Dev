// The starter in a real browser (Chromium, through the local Chest):
// islands hydrate under the strict policy, forms post in place, refresh()
// keeps focus, scroll, typed text and each island's state, and the same
// forms work without JavaScript.
//   node --test lab/starter-bench/browser.test.mjs   (after npm run build in starter/)
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";
import { runTool } from "./chest.mjs";

const dir = resolve(import.meta.dirname, "../../starter");
let tool, browser;
before(async () => {
  tool = await runTool(dir);
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await tool?.stop();
});

async function open(options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const problems = [];
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") problems.push(m.text()); });
  page.on("pageerror", e => problems.push(e.message));
  await page.goto(`${tool.origin}/chest`);
  return { page, problems, close: () => context.close() };
}

test("islands hydrate under the policy, without a warning", async () => {
  const { page, problems, close } = await open();
  await page.waitForFunction(() => document.querySelector("[data-island='ToastHost'] .ck-toasts") !== null);
  await page.waitForTimeout(300);
  assert.deepEqual(problems, []);
  await close();
});

test("a form posts in place: no page load, the form emptied, focus kept", async () => {
  const { page, problems, close } = await open();
  await page.evaluate(() => { window.samePage = true; });
  await page.fill("#body", "Fire drill on Friday");
  await page.click("form.composer button");
  await page.waitForSelector("li.note >> text=Fire drill on Friday");
  assert.equal(await page.evaluate(() => window.samePage), true);
  assert.equal(await page.inputValue("#body"), "");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Post");
  assert.deepEqual(problems, []);
  await close();
});

test("a refresh keeps what is typed, the scroll, an island's state; Undo works", async () => {
  const { page, problems, close } = await open({ viewport: { width: 800, height: 500 } });
  for (let i = 1; i <= 8; i++) {
    await page.fill("#body", `Note ${i}`);
    await page.click("form.composer button");
    await page.waitForSelector(`li.note >> text="Note ${i}"`);
  }
  // A draft typed, the page scrolled, a toast shown (ToastHost's state).
  await page.fill("#body", "a draft");
  const note = page.locator("li.note", { hasText: "Note 1" });
  await note.scrollIntoViewIfNeeded();
  await note.getByRole("button", { name: "Delete" }).click();
  await page.waitForSelector(".ck-toast >> text=Note deleted.");
  await page.waitForFunction(() => ![...document.querySelectorAll("li.note p")].some(p => p.textContent === "Note 1"));
  const scrolled = await page.evaluate(() => window.scrollY);
  assert.ok(scrolled > 0);
  // Another change refreshes the page: pin "Note 2" (it moves to the top).
  await page.locator("li.note", { hasText: "Note 2" }).getByRole("button", { name: "Pin" }).click();
  await page.waitForFunction(() => document.querySelector("li.note")?.textContent?.includes("Note 2"));
  assert.equal(await page.inputValue("#body"), "a draft");
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - scrolled) < 2, "scroll kept");
  assert.equal(await page.locator(".ck-toast >> text=Note deleted.").count(), 1, "the toast (an island's state) survived the refresh");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForSelector("li.note >> text=\"Note 1\"");
  // The moved note's island still acts on its own note.
  await page.locator("li.note", { hasText: "Note 2" }).getByRole("button", { name: "Delete" }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll("li.note p")].some(p => p.textContent === "Note 2"));
  assert.equal(await page.locator("li.note >> text=\"Note 3\"").count(), 1);
  assert.deepEqual(problems, []);
  await close();
});

test("a refusal is a toast in the reader's words", async () => {
  const { page, close } = await open();
  await page.evaluate(() => document.querySelector("#body").removeAttribute("required"));
  await page.fill("#body", "   ");
  await page.click("form.composer button");
  await page.waitForSelector(".ck-toast-error >> text=Write something first.");
  await close();
});

test("without JavaScript the same form posts and comes back", async () => {
  const { page, close } = await open({ javaScriptEnabled: false });
  await page.fill("#body", "Sent without script");
  await page.click("form.composer button");
  await page.waitForSelector("li.note >> text=Sent without script");
  assert.equal(new URL(page.url()).pathname, "/chest");
  await close();
});

test("a refresh that meets an error keeps the page and says so; 403 loads the page again", async () => {
  const { page, close } = await open();
  await page.fill("#body", "Kept through an error");
  await page.click("form.composer button");
  await page.waitForSelector("li.note >> text=Kept through an error");
  await page.evaluate(() => { window.samePage = true; });
  tool.fail(502);
  await page.locator("li.note", { hasText: "Kept through an error" }).getByRole("button", { name: /^(Pin|Unpin)$/u }).click();
  await page.waitForSelector(".ck-toast-error >> text=The Chest did not answer. Try again in a moment.");
  assert.equal(await page.locator("li.note >> text=Kept through an error").count(), 1, "the page is kept");
  assert.equal(await page.locator("[data-island='DeleteNote'] button").count() > 0, true, "its islands too");
  tool.fail(403);
  await page.locator("li.note", { hasText: "Kept through an error" }).getByRole("button", { name: /^(Pin|Unpin)$/u }).click();
  await page.waitForFunction(() => window.samePage !== true);
  await close();
});

test("Delete works without JavaScript too", async () => {
  const { page, close } = await open({ javaScriptEnabled: false });
  await page.fill("#body", "Deleted without script");
  await page.click("form.composer button");
  await page.locator("li.note", { hasText: "Deleted without script" }).getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/chest$/u);
  assert.equal(await page.locator("li.note >> text=Deleted without script").count(), 0);
  await close();
});

test("a second send while the first is on its way says so", async () => {
  const { page, close } = await open();
  await page.route("**/chest/actions/addNote", async route => { await new Promise(r => setTimeout(r, 400)); await route.continue(); });
  await page.fill("#body", "Sent once");
  await page.click("form.composer button");
  await page.click("form.composer button");
  await page.waitForSelector(".ck-toast >> text=Still sending…");
  await page.waitForSelector("li.note >> text=Sent once");
  assert.equal(await page.locator("li.note >> text=Sent once").count(), 1);
  await close();
});

test("the browser's files are cached: for ever with ?v=, an hour without", async () => {
  assert.equal((await fetch(`${tool.origin}/assets/client.js?v=x`)).headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await fetch(`${tool.origin}/assets/client.js`)).headers.get("cache-control"), "public, max-age=3600");
});

test("a 502 that is not a page keeps the page and what is typed; call() on the Chest's 403 loads the page again", async () => {
  const { page, close } = await open();
  await page.fill("#body", "Kept text");
  await page.evaluate(() => { window.samePage = true; });
  tool.fail(502, { type: "text/plain" });
  await page.locator("li.note").first().getByRole("button", { name: /^(Pin|Unpin)$/u }).click();
  await page.waitForSelector(".ck-toast-error >> text=The Chest did not answer. Try again in a moment.");
  assert.equal(await page.inputValue("#body"), "Kept text");
  assert.equal(await page.evaluate(() => window.samePage), true);
  tool.fail(403, { method: "POST" });
  await page.locator("li.note").first().getByRole("button", { name: "Delete" }).click();
  await page.waitForFunction(() => window.samePage !== true);
  await close();
});
