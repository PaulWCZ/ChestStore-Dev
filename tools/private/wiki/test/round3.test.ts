import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import * as members from "@argentic/chest-sdk/members";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { pictureOf } from "../app/chest/pages/[id]/edit/paste.ts";
import { normalize } from "../lib/doc.ts";
import * as editing from "../lib/editing.ts";
import { askWhom, whoWrites } from "../lib/groups.ts";
import * as pages from "../lib/pages.ts";
import { kept, search, segments } from "../lib/search.ts";
import * as spaces from "../lib/spaces.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, lea, tom } from "./support/members.ts";

// The third severe critique: nothing pasted disappears silently (pictures
// from the web); search by the stem of a word, French and English, with a
// relevance floor, and "Wi-Fi" marked whole; a reader's empty wiki names
// who can write.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications"] });
  await database.sql.unsafe(readFileSync(join(import.meta.dirname, "..", "seed", "sample.sql"), "utf8")).simple();
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(() => members.forget());

const titles = async (q: string, who = hugo) => (await search(database.sql, asMember(who), q)).map(h => h.title.map(s => s.text).join(""));

test("a pasted picture: the wiki's own stays (even with its full address), the web's is named, the clipboard's is a file", () => {
  const origin = "https://lumen.chest.example";
  assert.deepEqual(pictureOf("/chest/files/12", origin), { kind: "ours", src: "/chest/files/12" });
  assert.deepEqual(pictureOf("https://lumen.chest.example/chest/files/12", origin), { kind: "ours", src: "/chest/files/12" });
  // Another Chest's file, or ours with a query: from the web.
  assert.deepEqual(pictureOf("https://other.chest.example/chest/files/12", origin), { kind: "web", href: "https://other.chest.example/chest/files/12" });
  assert.deepEqual(pictureOf("https://lh7-rt.googleusercontent.com/docsz/AD_4nX?key=abc", origin), { kind: "web", href: "https://lh7-rt.googleusercontent.com/docsz/AD_4nX?key=abc" });
  // Nothing to link to: a note without a link.
  assert.deepEqual(pictureOf("javascript:alert(1)", origin), { kind: "web", href: null });
  assert.deepEqual(pictureOf("file:///C:/Users/x.png", origin), { kind: "web", href: null });
  const inside = pictureOf("data:image/png;base64,iVBORw0KGgo=", origin);
  assert.equal(inside.kind, "inside");
  // Only pictures travel inside the clipboard; anything else is from the web.
  assert.equal(pictureOf("data:text/html;base64,PGI+", origin).kind, "web");
});

test("normalize counts the pictures it leaves out, and the save says so instead of a bare 'Saved.'", async () => {
  const sql = database.sql;
  const dropped = { pictures: 0 };
  const doc = normalize({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Plan" }] },
    { type: "image", attrs: { src: "https://example.com/x.png" } },
    { type: "blockquote", content: [{ type: "image", attrs: { src: "data:image/png;base64,AAAA" } }] },
    { type: "image", attrs: { src: "/chest/files/4" } },
  ] }, dropped);
  assert.equal(dropped.pictures, 2);
  assert.equal(doc.content.filter(n => n.type === "image").length, 1);

  const made = await pages.createPage(sql, asMember(tom), { spaceId: "3", title: "Team meeting, 28 September" });
  await editing.startEditing(sql, asMember(tom), made.id);
  const saved = await editing.publish(sql, asMember(tom), made.id, { title: "Team meeting, 28 September", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Decisions" }] }, { type: "image", attrs: { src: "https://example.com/x.png", alt: "schema" } }] }, baseVersion: 1 });
  assert.equal(saved.dropped, 1);
  assert.equal(saved.changed, true);
  // What the editor sends after a paste: the note in the picture's place, kept.
  await editing.startEditing(sql, asMember(tom), made.id);
  const note = { type: "callout", attrs: { tone: "warning" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Picture from the web not kept (“schema”): download it, then drop it here. " }, { type: "text", text: "Open the picture", marks: [{ type: "link", attrs: { href: "https://example.com/x.png" } }] }] }] };
  const again = await editing.publish(sql, asMember(tom), made.id, { title: "Team meeting, 28 September", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Decisions" }] }, note] }, baseVersion: saved.version });
  assert.equal(again.dropped, 0);
  const p = await pages.page(sql, asMember(hugo), made.id);
  assert.equal(p.doc.content[1]?.type, "callout");
  assert.equal(p.doc.content[1]?.content?.[0]?.content?.[1]?.marks?.[0]?.attrs?.["href"], "https://example.com/x.png");
});

test("stems, French and English: rembourser, remboursé, remboursement, reimbursed; mutuelle, RTT, vpn", async () => {
  for (const q of ["remboursé", "rembourser", "remboursements", "Remboursée"]) assert.equal((await titles(q))[0], "Se faire rembourser ses frais", q);
  // The English expense page by the stem of "reimburse".
  assert.equal((await titles("reimbursed"))[0], "Expense policy");
  assert.equal((await titles("reimbursing"))[0], "Expense policy");
  assert.equal((await titles("mutuelle"))[0], "Mutuelle et prévoyance");
  assert.equal((await titles("mutuelles"))[0], "Mutuelle et prévoyance");
  assert.equal((await titles("RTT"))[0], "Temps de travail et RTT");
  assert.equal((await titles("vpn"))[0], "Working from outside: the VPN");
  // A stem marks the word as the page writes it.
  const [hit] = await search(database.sql, asMember(hugo), "rembourser");
  assert.ok(hit!.snippet.some(s => s.hit && /^rembours/iu.test(s.text)), JSON.stringify(hit!.snippet));
});

test("a relevance floor: the words as typed first, titles before passing mentions, no page for a typo's neighbour when better ones exist", async () => {
  const horaires = await titles("horaires");
  assert.equal(horaires[0], "Règlement intérieur", horaires.join(", "));
  // Pages that only say "opening hours" (a word that means the same) come after the pages saying "horaires".
  assert.ok(horaires.indexOf("Deploying a firmware update") > horaires.indexOf("Charte télétravail"), horaires.join(", "));
  const newcomer = await titles("nouvel arrivant");
  assert.equal(newcomer[0], "Accueillir un nouvel arrivant", newcomer.join(", "));
  assert.ok(newcomer.includes("Onboarding for engineers"), newcomer.join(", "));
  assert.ok(!newcomer.includes("Expense policy"), newcomer.join(", "));
  // Keys and office: the page holding both; not every page that says "office".
  const keys = await titles("clé bureau");
  assert.equal(keys[0], "Who to ask");
  assert.ok(keys.length <= 3, keys.join(", "));
  // "tt": the charter's title before a page that links to it.
  assert.equal((await titles("tt"))[0], "Charte télétravail");
  // A typo alone still finds (nothing better exists).
  assert.equal((await titles("pasword"))[0], "Password manager");
  // The rule itself.
  const row = (matched: number, typed: number, strong: number) => ({ matched, typed, strong });
  assert.deepEqual(kept([row(1, 0, 1), row(1, 0, 0)], 1), [row(1, 0, 1)]);
  assert.deepEqual(kept([row(2, 0, 2), row(1, 1, 1), row(1, 0, 1)], 2), [row(2, 0, 2), row(1, 1, 1)]);
  assert.deepEqual(kept([row(1, 0, 0), row(1, 0, 0)], 1), [row(1, 0, 0), row(1, 0, 0)]);
});

test("the highlight keeps 'Wi-Fi' whole", async () => {
  assert.deepEqual(segments("See \u0001Wi\u0002-\u0001Fi\u0002 and \u0001network\u0002"), [{ text: "See ", hit: false }, { text: "Wi-Fi", hit: true }, { text: " and ", hit: false }, { text: "network", hit: true }]);
  // Two words apart stay apart.
  assert.deepEqual(segments("\u0001Wi\u0002 - \u0001Fi\u0002").map(s => s.text), ["Wi", " - ", "Fi"]);
  for (const q of ["wifi", "Wi-Fi", "wi fi"]) {
    const [first] = await search(database.sql, asMember(hugo), q);
    assert.equal(first!.title.map(s => s.text).join(""), "Wi-Fi and printers", q);
    assert.ok(first!.title.some(s => s.hit && s.text === "Wi-Fi"), `${q}: ${JSON.stringify(first!.title)}`);
    assert.ok(!first!.snippet.some(s => s.hit && (s.text === "Wi" || s.text === "Fi")), `${q}: ${JSON.stringify(first!.snippet)}`);
  }
});

test("a reader's empty wiki names who can write: the editors, or a space's own", async () => {
  const all = await whoWrites();
  // Editors by name, the Chest's administrators last.
  assert.deepEqual(all.names, ["Inès Moreau", "Tom Walker", "Camille Martin"]);
  assert.ok(!all.names.includes("Hugo Bernard") && !all.names.includes("Léa Dubois"));
  assert.equal(await askWhom("en", "another editor"), "Inès Moreau, Tom Walker or Camille Martin");
  assert.equal(await askWhom("fr", "un autre rédacteur"), "Inès Moreau, Tom Walker ou Camille Martin");
  // Sales names its editors (the sales group): Inès, and the administrator.
  const sales = await spaces.space(database.sql, asMember(lea), "2");
  assert.deepEqual((await whoWrites(sales)).names, ["Inès Moreau", "Camille Martin"]);
  // No answer from the Chest: no names (the page says it without them).
  const api = process.env["CHEST_API"];
  process.env["CHEST_API"] = "http://127.0.0.1:9";
  try {
    members.forget();
    assert.equal(await askWhom("en", "another editor"), null);
  } finally {
    process.env["CHEST_API"] = api;
  }
});
