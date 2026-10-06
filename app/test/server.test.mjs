import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { en as kit } from "@argentic/chest-ui/components/logic";
import { createElement as h, useId } from "react";
import { action, createApp, fail, field, Island, page, publicAction, publicActionsAt, publicPage, redirect } from "../dist/index.js";
import { db } from "../dist/db.js";
import { checkPage, testDatabase } from "../dist/testing.js";

// A tool of a few lines on the built package, asked as the Chest asks.
const words = {
  kit,
  tool: { name: "Probe" },
  pages: { notFound: { title: "Nothing here", body: "." }, forbidden: { title: "Not allowed", body: "." }, failed: { title: "Failed", body: "." }, signIn: "Sign in.", busy: "Busy.", language: "Language", back: "Back" },
  errors: { invalid: "Invalid.", empty: "Empty.", too_long: "Too long: {max} at most.", too_large: "Too large.", forbidden: "Forbidden.", not_found: "Not found.", unavailable: "Unavailable.", unknown: "Unknown." },
};
function Labelled({ label }) {
  const id = useId();
  return h("label", { htmlFor: id }, label, h("input", { id }));
}
const actions = {
  echo: action({ text: field.text({ max: 5 }) }, async ({ text }, { member }) => ({ text, who: member.id })),
  go: action({}, async () => redirect("/chest/elsewhere")),
  big: action({ text: field.text({ max: 1e6 }) }, async () => null, { maxBody: 100 }),
  refuse: action({}, async () => fail("forbidden")),
  shout: publicAction({ text: field.text({ max: 5 }) }, async () => null),
};
let completed = 0;
const layout = ({ notice, children }) => h("main", { id: "main" }, notice && h("p", { role: "alert" }, notice), children);
const app = createApp({
  actions, islands: { Labelled }, locales: ["en"], words: () => words, layouts: { members: layout, public: layout },
  look: viewer => ({ css: viewer.member ? ":root{--ink:#111}" : ":root{--ink:#222}", colors: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }] }),
  complete: async who => { completed++; return { ...who, groups: ["grp_completedcompletedcompleted"] }; },
});
app.post("/p/:link/actions/:name", publicActionsAt());
app.get("/chest/groups", page(({ member }) => ({ title: "Groups", body: h("p", null, member.groups.join(",")) })));
app.get("/chest", page(({ t }) => ({ title: "Home", body: h("div", null, h(Island, { name: "Labelled", props: { label: "A" } }), h(Island, { name: "Labelled", props: { label: "B" } }), t.tool.name) })));
app.get("/chest/day", page(async () => {
  const [{ day }] = await db()`select date '2026-10-05' as day`;
  return { title: "Day", body: h("p", null, typeof day + " " + day) };
}));
app.get("/", publicPage(() => ({ title: "Public", body: h("p", null, "hello") })));

const member = { id: "mbr_camillemartincamillemartin", firstName: "C", lastName: "M", name: "C M", photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" };
let chest, database;
before(async () => { chest = await fakeChest({ members: [member] }); database = await testDatabase({ migrations: "test/no-migrations" }); });
after(async () => { await database.close(); await chest.close(); });

const url = path => `https://tool.test${path}`;
const get = (path, who = member) => app.fetch(who ? withMember(new Request(url(path)), who) : new Request(url(path)));
const post = (path, body, headers = {}, who = member) => app.fetch(withMember(new Request(url(path), { method: "POST", body, headers: { "sec-fetch-site": "same-origin", host: "tool.test", ...headers } }), who));
const json = (path, input, who) => post(path, JSON.stringify(input), { "content-type": "application/json", "x-tool-action": "1" }, who);

test("a page: islands rendered each as its own root (ids that match the browser's), the policy", async () => {
  const response = await get("/chest");
  const html = checkPage(await response.text());
  const prefixes = [...html.matchAll(/data-prefix="([^"]+)"/gu)].map(m => m[1]);
  assert.equal(prefixes.length, 2);
  assert.notEqual(prefixes[0], prefixes[1]);
  for (const p of prefixes) assert.match(html, new RegExp(`for="_?«?${p}`, "u"));
  assert.match(response.headers.get("content-security-policy"), /^default-src 'self'; script-src 'self'; style-src 'self'/u);
  assert.equal((await get("/chest", null)).status, 401);
});

test("actions: JSON for an island, a redirect for a form, refusals with their values", async () => {
  assert.deepEqual(await (await json("/chest/actions/echo", { text: "hi" })).json(), { ok: true, value: { text: "hi", who: member.id } });
  assert.deepEqual(await (await json("/chest/actions/echo", { text: "toolong" })).json(), { ok: false, error: "too_long", message: "Too long: 5 at most." });
  assert.deepEqual(await (await json("/chest/actions/go", {})).json(), { ok: true, value: null, redirect: "/chest/elsewhere" });
  assert.equal((await json("/chest/actions/refuse", {})).status, 403);
  const big = await json("/chest/actions/big", { text: "x".repeat(200) });
  assert.equal(big.status, 413);
  assert.equal((await big.json()).error, "too_large");
  const form = await post("/chest/actions/echo", new URLSearchParams({ text: "toolong" }), { referer: url("/chest?error=old") });
  assert.equal(form.status, 303);
  const back = form.headers.get("location");
  assert.equal(back, `/chest?error=too_long&values=${encodeURIComponent('{"max":5}')}`);
  assert.match(await (await get(back)).text(), /role="alert">Too long: 5 at most\./u);
  assert.equal((await json("/actions/shout", { text: "x" })).status, 200);
  assert.equal((await json("/chest/actions/shout", { text: "x" })).status, 404);
  assert.equal((await json("/chest/actions/echo", { text: "x" }, member)).status, 200);
  const cross = await post("/chest/actions/echo", JSON.stringify({ text: "x" }), { "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "cross-site" });
  assert.equal(cross.status, 403);
  assert.equal((await cross.json()).error, "forbidden");
});

test("the language switch and the forms never send elsewhere", async () => {
  for (const evil of ["//evil.example", "/%5Cevil.example", "/%09/evil.example", "https://evil.example", "/chest"]) {
    assert.equal((await get(`/lang/en?back=${evil}`, null)).headers.get("location"), "/", evil);
  }
  assert.equal((await get("/lang/en?back=/jobs?x=1", null)).headers.get("location"), "/jobs?x=1");
  const form = await post("/chest/actions/echo", new URLSearchParams({ text: "x" }), { referer: "https://evil.example/chest/x" });
  assert.equal(form.headers.get("location"), "/chest");
});

test("db(): a date column is a day as text", async () => {
  assert.match(await (await get("/chest/day")).text(), /string 2026-10-05/u);
});

test("options: a look served as a stylesheet with its hash, the member completed, public actions under a path", async () => {
  const html = await (await get("/chest")).text();
  const href = /href="(\/chest\/look\.css\?v=[^"]+)"/u.exec(html)?.[1];
  assert.ok(href, "the look's link");
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#ffffff"\/>/u);
  const before = completed;
  const sheet = await get(href);
  assert.equal(completed, before, "complete() is not run for the look");
  assert.equal(await sheet.text(), ":root{--ink:#111}");
  assert.equal(sheet.headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.equal((await get("/look.css", null)).headers.get("cache-control"), "private, no-cache");
  assert.match(await (await get("/chest/groups")).text(), /grp_completedcompletedcompleted/u);
  assert.equal((await json("/p/abc/actions/shout", { text: "x" })).status, 200);
  assert.equal((await json("/p/abc/actions/echo", { text: "x" })).status, 404, "a members' action is not served there");
  assert.match(await (await get("/chest/nothing")).text(), /href="\/chest">Back</u);
  assert.doesNotMatch(await (await get("/nothing", null)).text(), />Back</u);
});

test("the log names the route, never the path or the query", async () => {
  const lines = [];
  const write = console.log;
  console.log = line => lines.push(String(line));
  try {
    await json("/p/secret-guest-link/actions/shout?token=abc", { text: "x" });
    await get("/chest/day?token=abc");
    await get("/nowhere/secret", null);
  } finally {
    console.log = write;
  }
  const text = lines.join("\n");
  assert.doesNotMatch(text, /secret|token|abc/u);
  assert.match(text, /route=\/p\/:link\/actions\/:name action=shout status=200/u);
  assert.match(text, /route=\/chest\/day status=200/u);
  assert.match(text, /route=\(none\) status=404/u);
});
