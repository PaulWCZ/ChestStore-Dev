// The order of page reads in the browser (runtime.tsx's load()): a read
// that an action or a navigation overtook is never put on screen, the
// screen ends on the action's outcome, and the newest read wins. A real
// DOM (happy-dom), a fetch the test answers by hand, in the order it wants.
import assert from "node:assert/strict";
import { test as nodeTest } from "node:test";

// A test that waits for an answer that never comes fails, the next starts
// clean (what was left waiting is dropped).
const test = (name, fn) => nodeTest(name, { timeout: 4000 }, fn);
import { Window } from "happy-dom";

const win = new Window({ url: "https://tool.test/chest/notes" });
for (const name of ["window", "document", "DOMParser", "history", "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLMetaElement", "HTMLScriptElement", "HTMLAnchorElement", "sessionStorage", "MouseEvent"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? win : win[name], configurable: true, writable: true });
}
// The address is the window's; a page load (reload, assign) is recorded,
// not made.
const loads = [];
Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: {
    get href() { return win.location.href; },
    get origin() { return win.location.origin; },
    get pathname() { return win.location.pathname; },
    get search() { return win.location.search; },
    get hash() { return win.location.hash; },
    reload() { loads.push(`reload ${win.location.pathname}`); },
    assign(to) { loads.push(`assign ${new URL(to, win.location.href).pathname}`); },
  },
});
globalThis.addEventListener = win.addEventListener.bind(win);
globalThis.scrollTo = () => {};
globalThis.scrollY = 0;

// Every request waits until the test answers it.
const asked = [];
globalThis.fetch = (url, init = {}) => new Promise(resolve => asked.push({ url: new URL(String(url), win.location.href).pathname, method: init.method ?? "GET", resolve, done: false }));
const tick = () => new Promise(resolve => setTimeout(resolve, 2));
async function waitFor(what) {
  for (let i = 0; i < 200; i++) {
    const found = asked.find(r => !r.done && what(r));
    if (found) return found;
    await tick();
  }
  throw new Error(`no request ${what}; asked: ${asked.map(r => `${r.method} ${r.url}${r.done ? "" : " (waiting)"}`).join(", ")}`);
}
const reads = (path) => asked.filter(r => r.method === "GET" && r.url === path).length;
const pageOf = (title) => `<!doctype html><html><head><title>${title}</title></head><body><main id="main"><h1>${title}</h1></main></body></html>`;
function respond(request, { status = 200, title, json, url }) {
  request.done = true;
  const body = json !== undefined ? JSON.stringify(json) : pageOf(title);
  const response = new Response(body, { status, headers: { "content-type": json !== undefined ? "application/json" : "text/html; charset=utf-8" } });
  Object.defineProperty(response, "url", { value: new URL(url ?? request.url, win.location.href).href });
  Object.defineProperty(response, "redirected", { value: false });
  request.resolve(response);
}
const answerRead = async (path, page) => respond(await waitFor(r => r.method === "GET" && r.url === path), page);
const answerAction = async (name, json = { ok: true, value: null }) => respond(await waitFor(r => r.method === "POST" && r.url.endsWith(`/actions/${name}`)), { json });
const shown = () => document.querySelector("h1")?.textContent;
// Everything asked has had its answer and the runtime is still.
async function quiet() {
  for (let i = 0; i < 10; i++) await tick();
  assert.deepEqual(asked.filter(r => !r.done).map(r => `${r.method} ${r.url}`), [], "nothing left waiting");
}

document.write(pageOf("4 notes"));
const { navigate, refresh, send, startIslands } = await import("../dist/runtime.js");
await startIslands({}, {});
const act = (name, options) => send(`/chest/actions/${name}`, { "content-type": "application/json" }, "{}", options);
async function at(path, title) {
  for (const r of asked) r.done = true;
  loads.length = 0;
  win.history.replaceState(null, "", path);
  const done = refresh();
  await answerRead(path, { title });
  assert.equal(await done, true);
  assert.equal(shown(), title);
}

test("a read that started before an action and answers after it is not shown; the page is read again", async () => {
  await at("/chest/notes", "4 notes");
  const live = refresh(); // useLive's read after joining the channel
  const removed = act("remove", { refresh: false }); // an island's call(…, { refresh: false })
  await answerAction("remove");
  assert.equal((await removed).ok, true);
  await answerRead("/chest/notes", { title: "3 notes" }); // read by the server before the remove
  await tick();
  assert.notEqual(shown(), "3 notes", "the read the action overtook is not on screen");
  await answerRead("/chest/notes", { title: "2 notes" }); // read again, after the remove
  assert.equal(await live, true, "the read that was asked is answered, by the page read again");
  assert.equal(shown(), "2 notes");
  await quiet();
  assert.deepEqual(loads, []);
});

test("an action's own refresh wins over a read it overtook, and nothing more is read", async () => {
  await at("/chest/notes", "2 notes");
  const before = reads("/chest/notes");
  const live = refresh();
  const added = act("add");
  await answerAction("add");
  // Two reads on their way: the live one (older) and the action's own.
  await waitFor(r => r.method === "GET" && asked.filter(x => x.method === "GET" && !x.done).length === 2);
  const [older, own] = asked.filter(r => r.method === "GET" && !r.done);
  respond(own, { title: "3 notes" });
  assert.equal((await added).ok, true);
  assert.equal(shown(), "3 notes");
  respond(older, { title: "2 notes, stale" });
  assert.equal(await live, false);
  assert.equal(shown(), "3 notes");
  await quiet();
  assert.equal(reads("/chest/notes") - before, 2, "no read again: the action's refresh came after");
});

test("a read on its way while an action runs, answered in the gap before the action's refresh, is not shown", async () => {
  await at("/chest/notes", "3 notes");
  const live = refresh();
  const done = act("add");
  const post = await waitFor(r => r.method === "POST");
  const read = await waitFor(r => r.method === "GET");
  // The read's answer is in the browser's hands as the action's comes.
  respond(read, { title: "3 notes, stale" });
  respond(post, { json: { ok: true, value: null } });
  await answerRead("/chest/notes", { title: "4 notes" });
  assert.equal((await done).ok, true);
  await live;
  await quiet();
  assert.equal(shown(), "4 notes");
});

test("the reported race: delete, navigate away, and a refresh of the deleted page answers 404 — no page load, the navigation stays", async () => {
  await at("/chest/pages/7", "Page 7");
  const removed = act("deletePage", { refresh: false });
  await answerAction("deletePage");
  assert.equal((await removed).ok, true);
  const away = navigate("/chest/spaces/1"); // the island's navigate() after the delete
  const live = refresh(); // the delete's own realtime event, or the join's read
  await answerRead("/chest/pages/7", { status: 404, title: "Nothing here" });
  assert.equal(await live, false);
  assert.deepEqual(loads, [], "the page is not loaded again");
  await answerRead("/chest/spaces/1", { title: "Space 1" });
  await away;
  assert.equal(shown(), "Space 1");
  assert.equal(win.location.pathname, "/chest/spaces/1");
  await quiet();
  assert.deepEqual(loads, []);
});

test("a refresh that started while a navigation was on its way, answered after it, does not put the old page at the new address", async () => {
  await at("/chest/pages/8", "Page 8");
  const away = navigate("/chest/spaces/2");
  const live = refresh(); // reads /chest/pages/8
  await answerRead("/chest/spaces/2", { title: "Space 2" });
  await away;
  await answerRead("/chest/pages/8", { title: "Page 8 again" });
  assert.equal(await live, false);
  assert.equal(shown(), "Space 2");
  assert.equal(win.location.pathname, "/chest/spaces/2");
  await quiet();
});

test("a navigation read across an action is shown (the person's click), then read again", async () => {
  await at("/chest/a", "A");
  const go = navigate("/chest/b");
  const done = act("rename", { refresh: false });
  await answerAction("rename");
  await done;
  await answerRead("/chest/b", { title: "B before the rename" });
  await go;
  assert.equal(win.location.pathname, "/chest/b");
  await answerRead("/chest/b", { title: "B renamed" });
  await quiet();
  assert.equal(shown(), "B renamed");
});

test("two refreshes answered out of order: the latest asked wins", async () => {
  await at("/chest/notes", "1");
  const first = refresh();
  const second = refresh();
  const [a, b] = asked.filter(r => !r.done);
  respond(b, { title: "newer" });
  respond(a, { title: "older" });
  assert.equal(await second, true);
  assert.equal(await first, false);
  assert.equal(shown(), "newer");
  await quiet();
});

test("two navigations answered out of order: the last click wins", async () => {
  await at("/chest/a", "A");
  const first = navigate("/chest/x");
  const second = navigate("/chest/y");
  await answerRead("/chest/y", { title: "Y" });
  await second;
  await answerRead("/chest/x", { title: "X" });
  await first;
  assert.equal(shown(), "Y");
  assert.equal(win.location.pathname, "/chest/y");
  await quiet();
});

test("Back while a navigation is on its way: the navigation is dropped, the page Back reached is shown", async () => {
  await at("/chest/a", "A");
  const go = navigate("/chest/b");
  await answerRead("/chest/b", { title: "B" });
  await go;
  const late = navigate("/chest/c");
  win.history.back();
  await answerRead("/chest/a", { title: "A again" });
  await answerRead("/chest/c", { title: "C" });
  await late;
  await quiet();
  assert.equal(win.location.pathname, "/chest/a");
  assert.equal(shown(), "A again");
});

test("an action refused: a read it overtook is read again, and the caller's promise ends", async () => {
  await at("/chest/notes", "5 notes");
  const live = refresh();
  const refused = act("remove", { quiet: true });
  await answerAction("remove", { ok: false, error: "forbidden", message: "No." });
  assert.equal((await refused).ok, false);
  await answerRead("/chest/notes", { title: "5 notes, before" });
  await answerRead("/chest/notes", { title: "6 notes" }); // someone else added one
  assert.equal(await live, true);
  assert.equal(shown(), "6 notes");
  await quiet();
});

test("a read across two queued actions is read again once, after both", async () => {
  await at("/chest/notes", "7 notes");
  const before = reads("/chest/notes");
  const live = refresh();
  const one = act("remove", { refresh: false });
  const two = act("remove", { refresh: false });
  await answerAction("remove");
  await answerRead("/chest/notes", { title: "6 notes, between" });
  await answerAction("remove");
  await Promise.all([one, two]);
  await answerRead("/chest/notes", { title: "5 notes" });
  assert.equal(await live, true);
  assert.equal(shown(), "5 notes");
  await quiet();
  assert.equal(reads("/chest/notes") - before, 2, "one read again, not one per action");
});

test("an action's refresh overtaken by a slow parallel action ends once that one is answered (no spinner left)", async () => {
  await at("/chest/notes", "5 notes");
  const slow = act("summarise", { parallel: true, refresh: false });
  const quick = act("add");
  await answerAction("add");
  await answerRead("/chest/notes", { title: "6 notes, while summarising" });
  let ended = false;
  void quick.then(() => { ended = true; });
  await tick();
  assert.equal(ended, false, "the call waits for its page");
  await answerAction("summarise");
  await answerRead("/chest/notes", { title: "6 notes, summarised" });
  assert.equal((await quick).ok, true);
  assert.equal((await slow).ok, true);
  assert.equal(shown(), "6 notes, summarised");
  await quiet();
});
