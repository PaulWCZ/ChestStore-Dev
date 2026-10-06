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

test("islands hydrate under the policy, without a warning; their wrappers take no room (the package's CSS)", async () => {
  const { page, problems, close } = await open();
  await page.waitForFunction(() => document.querySelector("[data-island='ToastHost'] .ck-toasts") !== null);
  await page.waitForTimeout(300);
  assert.deepEqual(problems, []);
  assert.deepEqual(await page.evaluate(() => [...new Set([...document.querySelectorAll(".island")].map(e => getComputedStyle(e).display))]), ["contents"]);
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

test("a field's refusal is said under that field in the reader's words, gone at the next send", async () => {
  const { page, close } = await open();
  await page.evaluate(() => document.querySelector("#body").removeAttribute("required"));
  await page.fill("#body", "   ");
  await page.click("form.composer button");
  await page.waitForSelector("#body + .ck-error >> text=Write something first.");
  assert.equal(await page.getAttribute("#body", "aria-invalid"), "true");
  assert.match(await page.getAttribute("#body", "aria-describedby"), /body-error/u);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "body");
  assert.equal(await page.locator(".ck-toast-error").count(), 0, "no toast");
  await page.fill("#body", "Now something");
  await page.click("form.composer button");
  await page.waitForSelector("li.note >> text=Now something");
  assert.equal(await page.locator("#body + .ck-error").count(), 0);
  assert.equal(await page.getAttribute("#body", "aria-invalid"), null);
  await close();
});

test("without JavaScript the same form posts and comes back", async () => {
  const { page, close } = await open({ javaScriptEnabled: false });
  await page.fill("#body", "Sent without script");
  await page.click("form.composer button");
  await page.waitForSelector("li.note >> text=Sent without script");
  assert.equal(new URL(page.url()).pathname, "/chest");
  // Refused (too long, past what the field allows): back with the notice,
  // and what was typed is still there.
  const long = "x".repeat(2001);
  await page.$eval("#body", (el, text) => { el.removeAttribute("maxlength"); el.value = text; }, long);
  await page.click("form.composer button");
  await page.waitForSelector("[role=alert]");
  assert.equal((await page.inputValue("#body")).length, 2001, "the text came back");
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

test("the browser's files are cached: for ever when named by hash or ?v=, an hour without", async () => {
  const page = await (await fetch(`${tool.origin}/chest`)).text();
  const script = /src="(\/assets\/client-[\w-]+\.js)"/u.exec(page)?.[1];
  assert.ok(script, "the entry, named by its hash");
  assert.equal((await fetch(`${tool.origin}${script}`)).headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await fetch(`${tool.origin}/assets/client.css?v=x`)).headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await fetch(`${tool.origin}/assets/client.css`)).headers.get("cache-control"), "public, max-age=3600");
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

test("links between pages go in place: the toast survives, Back restores the page and its scroll, focus goes to the heading", async () => {
  const { page, problems, close } = await open({ viewport: { width: 800, height: 400 } });
  for (let i = 1; i <= 6; i++) {
    await page.fill("#body", `Linked ${i}`);
    await page.click("form.composer button");
    await page.waitForSelector(`li.note >> text="Linked ${i}"`);
  }
  await page.evaluate(() => { window.samePage = true; });
  await page.locator("li.note", { hasText: "Linked 6" }).getByRole("button", { name: "Delete" }).click();
  await page.waitForSelector(".ck-toast >> text=Note deleted.");
  const link = page.locator("li.note a.note-link", { hasText: "Linked 1" });
  await link.scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => scrollY);
  await link.click();
  await page.waitForURL(/\/chest\/notes\/\d+$/u);
  await page.waitForSelector("article.note >> text=Linked 1");
  assert.equal(await page.evaluate(() => window.samePage), true, "no page load");
  assert.equal(await page.locator(".ck-toast >> text=Note deleted.").count(), 1, "the toast survived");
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "H1");
  await page.goBack();
  await page.waitForSelector("li.note >> text=\"Linked 2\"");
  await page.waitForFunction(y => Math.abs(scrollY - y) < 2, scrolled);
  assert.equal(await page.evaluate(() => window.samePage), true);
  // The opt-out: data-reload loads the page.
  await page.evaluate(() => document.querySelector("a.note-link")?.setAttribute("data-reload", ""));
  await page.locator("a.note-link").first().click();
  await page.waitForFunction(() => window.samePage !== true);
  assert.deepEqual(problems, []);
  await close();
});

test("a download is asked once (a link with download, or to a file's address); a link with a #place goes there in place", async () => {
  const { page, problems, close } = await open({ acceptDownloads: true });
  await page.fill("#body", "Exported");
  await page.click("form.composer button");
  await page.waitForSelector("li.note >> text=Exported");
  const before = tool.seen.length;
  const asked = () => tool.seen.slice(before).filter(r => r.startsWith("GET /chest/notes.csv")).length;
  const [first] = await Promise.all([page.waitForEvent("download"), page.click("a[href='/chest/notes.csv']")]);
  assert.match(first.suggestedFilename(), /^notes-\d{4}-\d{2}-\d{2}\.csv$/u);
  await page.evaluate(() => document.querySelector("a[href='/chest/notes.csv']")?.removeAttribute("download"));
  const [second] = await Promise.all([page.waitForEvent("download"), page.click("a[href='/chest/notes.csv']")]);
  assert.ok(second);
  assert.equal(asked(), 2, "one request per click (the server makes the file once each time)");
  // A #place on another page of the part: in place, then there.
  const id = await page.locator("li.note p[id$='-text']").first().getAttribute("id");
  await page.goto(`${tool.origin}/chest/notes/1`);
  await page.evaluate(place => {
    window.samePage = true;
    const a = document.createElement("a");
    a.href = `/chest#${place}`;
    a.id = "to-place";
    a.textContent = "there";
    document.querySelector("main")?.append(a);
  }, id);
  await page.click("#to-place");
  await page.waitForURL(new RegExp(`/chest#${id}$`, "u"));
  assert.equal(await page.evaluate(() => window.samePage), true, "no page load");
  assert.equal(await page.evaluate(() => document.activeElement?.id), id, "at the place");
  assert.deepEqual(problems, []);
  await close();
});

test("a page left open: read again while the person is there (a 304 when nothing changed), never once they are idle; again when they come back", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install();
  const statuses = [];
  page.on("response", r => { if (new URL(r.url()).pathname === "/chest" && r.request().method() === "GET") statuses.push(r.status()); });
  await page.goto(`${tool.origin}/chest`);
  await page.waitForFunction(() => document.querySelector("[data-island='AutoRefresh']") !== null && window.__chestStarted !== false);
  await page.waitForTimeout(300);
  const reads = () => statuses.length;
  // Someone else posts a note; the person scrolls: within a minute it shows.
  tool.sql("insert into notes (body, author) values ('From another desk', 'mbr_" + "s".repeat(26) + "')");
  await page.mouse.wheel(0, 10);
  await page.clock.runFor(61_000);
  await page.waitForSelector("li.note >> text=From another desk");
  // Nothing new: the next read is a 304 (the page's version), and waits longer.
  await page.mouse.wheel(0, 10);
  await page.clock.runFor(61_000);
  await page.waitForFunction(n => n > 0, statuses.filter(s => s === 304).length || 0).catch(() => {});
  await page.waitForTimeout(200);
  assert.ok(statuses.includes(304), `a 304 among ${JSON.stringify(statuses)}`);
  // Idle: after ten minutes without input, no read at all.
  await page.clock.runFor(15 * 60_000);
  await page.waitForTimeout(200);
  const idle = reads();
  await page.clock.runFor(60 * 60_000);
  await page.waitForTimeout(200);
  assert.equal(reads(), idle, "an idle tab lets the tool sleep");
  // Back: the window gets the focus, the page is read at once.
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await page.waitForFunction(n => n, true);
  await page.waitForTimeout(500);
  assert.equal(reads(), idle + 1, "read again on coming back");
  await context.close();
});

test("actions go one at a time, in the order asked", async () => {
  const { page, close } = await open();
  const events = [];
  await page.route("**/chest/actions/pinNote", async route => {
    events.push("start");
    if (events.length === 1) await new Promise(r => setTimeout(r, 400));
    await route.continue();
    events.push("end");
  });
  const pins = page.locator("li.note").getByRole("button", { name: /^(Pin|Unpin)$/u });
  await pins.nth(0).click();
  await pins.nth(1).click();
  await page.waitForFunction(() => true);
  for (let i = 0; i < 50 && events.length < 4; i++) await page.waitForTimeout(50);
  assert.deepEqual(events, ["start", "end", "start", "end"]);
  await close();
});

test("compressed: pages gzipped as they go, the browser's files brotli from the build", async () => {
  const html = await fetch(`${tool.origin}/chest`, { headers: { "accept-encoding": "gzip, br" } });
  assert.equal(html.headers.get("content-encoding"), "gzip");
  assert.match(html.headers.get("vary") ?? "", /accept-encoding/iu);
  const page = await html.text();
  const script = /src="(\/assets\/client-[\w-]+\.js)"/u.exec(page)?.[1];
  const js = await fetch(`${tool.origin}${script}`, { headers: { "accept-encoding": "gzip, br" } });
  assert.equal(js.headers.get("content-encoding"), "br");
  assert.match(js.headers.get("content-type") ?? "", /javascript/u);
  const plain = await fetch(`${tool.origin}${script}`, { headers: { "accept-encoding": "identity" } });
  assert.equal(plain.headers.get("content-encoding"), null);
});

test("a refresh that meets a 404 loads the page plainly (its 404), not 'did not answer'", async () => {
  const { page, close } = await open();
  await page.evaluate(() => { window.samePage = true; });
  tool.fail(404);
  await page.locator("li.note").first().getByRole("button", { name: /^(Pin|Unpin)$/u }).click();
  await page.waitForFunction(() => window.samePage !== true);
  await close();
});

test("after a deploy: a page of another build is loaded plainly, never put in place; an island's chunk that failed to load: the page loaded again, once", async () => {
  const { page, problems, close } = await open();
  await page.fill("#body", "Before the deploy");
  await page.click("form.composer button");
  await page.waitForSelector("li.note >> text=Before the deploy");
  await page.evaluate(() => { window.samePage = true; });
  // The server now runs another build: its pages link another entry.
  await page.route(/\/chest\/notes\/\d+$/u, async route => {
    if (!route.request().headers()["x-tool-navigate"]) return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/\/assets\/client-[\w-]+\.js/u, "/assets/client-NEXTBUILD.js") });
  });
  await page.locator("li.note a.note-link", { hasText: "Before the deploy" }).click();
  await page.waitForURL(/\/chest\/notes\/\d+$/u);
  await page.waitForSelector("article.note >> text=Before the deploy");
  assert.notEqual(await page.evaluate(() => window.samePage), true, "loaded plainly");
  await close();
  // A chunk refused once (the network, a deploy): the page is loaded again
  // (the browser keeps a failed module failed), and the island comes to life.
  const context = await browser.newContext();
  const fresh = await context.newPage();
  let refused = 0;
  await fresh.route(/\/assets\/DeleteNote-[\w-]+\.js$/u, route => (refused++ === 0 ? route.abort() : route.continue()));
  await fresh.goto(`${tool.origin}/chest`);
  await fresh.waitForFunction(() => document.documentElement.hasAttribute("data-ready"));
  const note = fresh.locator("li.note", { hasText: "Before the deploy" });
  await note.getByRole("button", { name: "Delete" }).click();
  await fresh.waitForSelector(".ck-toast >> text=Note deleted.");
  assert.ok(refused >= 2, `asked again (${refused} requests)`);
  // Refused for good: loaded again once only, never in a loop.
  const stuck = await context.newPage();
  await stuck.route(/\/assets\/DeleteNote-[\w-]+\.js$/u, route => route.abort());
  let loads = 0;
  stuck.on("load", () => loads++);
  await stuck.goto(`${tool.origin}/chest`);
  await stuck.waitForTimeout(1500);
  assert.equal(loads, 2, "one reload");
  assert.deepEqual(problems, []);
  await context.close();
});
