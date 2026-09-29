import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as chestFiles from "@argentic/chest-sdk/files";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { POST } from "../app/chest-events/route.ts";
import { references } from "../lib/doc.ts";
import * as editing from "../lib/editing.ts";
import { exportZip, pageHtml, pageMarkdown } from "../lib/export.ts";
import { attach, fileOf } from "../lib/files.ts";
import * as history from "../lib/history.ts";
import { importFiles } from "../lib/importer.ts";
import * as pages from "../lib/pages.ts";
import * as spaces from "../lib/spaces.ts";
import { readZip, writeZip } from "../lib/zip.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, tom } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const text = (s: string) => new TextEncoder().encode(s);
// A PNG's first bytes: the fake Chest checks images are what they say.
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const hex = (c: string) => c.repeat(32);

test("zip: what is written is read back; hostile archives are refused", () => {
  const zip = writeZip([{ name: "a/b.md", data: "# Hello\n" + "x".repeat(5000) }, { name: "c.png", data: png }]);
  const back = readZip(zip);
  assert.deepEqual(back.map(e => e.name), ["a/b.md", "c.png"]);
  assert.equal(new TextDecoder().decode(back[0]!.data).slice(0, 7), "# Hello");
  // Paths that climb out, and names that are not files, are ignored.
  const evil = readZip(writeZip([{ name: "../../etc/passwd", data: "x" }, { name: "__MACOSX/._a.md", data: "x" }, { name: "ok.md", data: "y" }]));
  assert.deepEqual(evil.map(e => e.name), ["ok.md"]);
  assert.throws(() => readZip(text("not a zip")), /import_invalid/u);
  // An entry that says 10 bytes but inflates to more is stopped there.
  const bomb = writeZip([{ name: "b.md", data: "a".repeat(100000) }]);
  const lying = Buffer.from(bomb);
  const central = lying.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  lying.writeUInt32LE(10, central + 24);
  assert.throws(() => readZip(lying), /import_invalid/u);
});

test("a Notion export becomes a space: tree, titles without ids, links, images; what cannot come is said", async () => {
  const { sql } = database;
  const inner = writeZip([
    { name: `Handbook ${hex("a")}.md`, data: `# Handbook\n\nStart with [Holidays](Handbook%20${hex("a")}/Holidays%20${hex("b")}.md).\n\n![Office](Handbook%20${hex("a")}/office.png)\n\n![Remote](https://tracker.test/x.png)` },
    { name: `Handbook ${hex("a")}/Holidays ${hex("b")}.md`, data: "# Holidays\n\n- [ ] Ask early\n- [x] Read this\n\nSee [the handbook](../Handbook%20" + hex("a") + ".md)." },
    { name: `Handbook ${hex("a")}/office.png`, data: png },
    { name: `Handbook ${hex("a")}/Team ${hex("c")}.csv`, data: "Name,Role\nA,B" },
    { name: `Tools ${hex("d")}/Laptops ${hex("e")}.md`, data: "Ask Tom." },
  ]);
  const outer = writeZip([{ name: "Export-123-Part-1.zip", data: inner }]);
  await assert.rejects(importFiles(sql, asMember(hugo), { spaceName: "Notion", files: [{ name: "export.zip", data: outer }], untitled: "Untitled" }), /forbidden/u);
  const result = await importFiles(sql, asMember(ines), { spaceName: "Notion", files: [{ name: "export.zip", data: outer }], untitled: "Untitled" });
  assert.equal(result.pages, 4);
  assert.equal(result.files, 1);
  assert.deepEqual(result.skipped, { files: [`Team ${hex("c")}.csv`], images: 1 });
  const nodes = await pages.tree(sql, asMember(hugo), [result.spaceId]);
  const byTitle = new Map(nodes.map(n => [n.title, n]));
  assert.deepEqual([...byTitle.keys()].sort(), ["Handbook", "Holidays", "Laptops", "Tools"]);
  assert.equal(byTitle.get("Holidays")!.parentId, byTitle.get("Handbook")!.id);
  assert.equal(byTitle.get("Laptops")!.parentId, byTitle.get("Tools")!.id);
  const handbook = await pages.page(sql, asMember(hugo), byTitle.get("Handbook")!.id);
  const refs = references(handbook.doc);
  assert.deepEqual(refs.pages, [byTitle.get("Holidays")!.id]);
  assert.equal(refs.files.length, 1);
  const image = await fileOf(sql, asMember(hugo), refs.files[0]!);
  assert.equal(image.image, true);
  assert.ok(chest.files.has(image.object));
  const holidays = await pages.page(sql, asMember(hugo), byTitle.get("Holidays")!.id);
  assert.deepEqual(holidays.doc.content.map(n => n.type), ["taskList", "paragraph"]);
  assert.deepEqual(references(holidays.doc).pages, [handbook.id]);
  assert.equal((await history.versions(sql, asMember(hugo), holidays.id))[0]?.kind, "imported");
  // Into an existing space, plain .md files at its top.
  const into = await importFiles(sql, asMember(ines), { spaceId: result.spaceId, files: [{ name: "Onboarding.md", data: text("Day one.") }], untitled: "Untitled" });
  assert.equal(into.pages, 1);
  await assert.rejects(importFiles(sql, asMember(ines), { spaceName: "Empty", files: [{ name: "photo.jpg", data: png }], untitled: "Untitled" }), /import_empty/u);
  assert.ok(!(await spaces.listSpaces(sql, asMember(ines))).some(s => s.name === "Empty"));
  await assert.rejects(importFiles(sql, asMember(ines), { spaceName: "Bad", files: [{ name: "broken.zip", data: text("nope") }], untitled: "Untitled" }), /import_invalid/u);
});

test("exports: a page as Markdown and as a web page; a space as a zip whose links still work", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(tom), { name: "Export" });
  const a = await pages.createPage(sql, asMember(tom), { spaceId: s.id, title: "Guide: <start>" });
  const b = await pages.createPage(sql, asMember(tom), { spaceId: s.id, parentId: a.id, title: "Details" });
  const object = `pages/${a.id}/${"ab".repeat(10)}.png`;
  await chestFiles.put(object, png, "image/png");
  const f = await attach(sql, asMember(tom), a.id, { object, fileName: "plan.png", type: "image/png", size: png.byteLength });
  await assert.rejects(attach(sql, asMember(hugo), a.id, { object, fileName: "x", type: "image/png", size: 1 }), /forbidden/u);
  await assert.rejects(attach(sql, asMember(tom), b.id, { object, fileName: "x", type: "image/png", size: 1 }), /invalid/u);
  const doc = { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Read " }, { type: "pageRef", attrs: { id: b.id } }] },
    { type: "image", attrs: { src: `/chest/files/${f.id}`, alt: "Plan" } },
  ] };
  await editing.startEditing(sql, asMember(tom), a.id);
  await editing.publish(sql, asMember(tom), a.id, { title: "Guide: <start>", doc, baseVersion: 1 });
  const md = await pageMarkdown(sql, asMember(hugo), a.id, "https://wiki.test", { missing: "gone" });
  assert.equal(md.name, "Guide start.md");
  assert.ok(md.text.startsWith("# Guide: <start>\n\nRead [Details](https://wiki.test/chest/pages/" + b.id + ")"), md.text);
  const html = await pageHtml(sql, asMember(hugo), a.id, "https://wiki.test", { missing: "gone", lang: "en", meta: "Exported" });
  assert.ok(html.html.includes("<title>Guide: &lt;start&gt;</title>"));
  assert.ok(html.html.includes('src="data:image/png;base64,'), "image inside");
  const zip = await exportZip(sql, asMember(hugo), { spaceId: s.id }, "https://wiki.test", { missing: "gone" });
  const entries = readZip(zip.data);
  assert.deepEqual(entries.map(e => e.name).sort(), [`files/${f.id}-plan.png`, "Guide start.md", "Guide start/Details.md"].sort());
  const guide = new TextDecoder().decode(entries.find(e => e.name === "Guide start.md")!.data);
  assert.ok(guide.includes("[Details](Guide%20start/Details.md)"), guide);
  assert.ok(guide.includes(`![Plan](files/${f.id}-plan.png)`), guide);
  const branch = readZip((await exportZip(sql, asMember(hugo), { pageId: b.id }, "https://wiki.test", { missing: "gone" })).data);
  assert.deepEqual(branch.map(e => e.name), ["Details.md"]);
  await assert.rejects(exportZip(sql, asMember({ ...lea, role: null }), { spaceId: s.id }, "https://wiki.test", { missing: "gone" }), /not_found/u);
});

test("someone who leaves frees the pages they were editing; an erasure removes their id everywhere, once", async () => {
  const { sql } = database;
  const s = await spaces.createSpace(sql, asMember(camille), { name: "People" });
  const p = await pages.createPage(sql, asMember(camille), { spaceId: s.id, title: "Who to ask" });
  await editing.startEditing(sql, asMember(tom), p.id);
  await editing.saveDraft(sql, asMember(tom), p.id, { title: "Who to ask", doc: { type: "doc" }, baseVersion: 1 });
  assert.equal(await chest.emit({ type: "member.removed", data: { id: tom.id } }, POST), 204);
  assert.equal(await editing.lockOf(sql, p.id), null);
  assert.equal((await sql`select count(*)::int as n from drafts where member_id = ${tom.id}`)[0]!["n"], 0);
  // Inès writes, then is erased.
  await editing.startEditing(sql, asMember(ines), p.id);
  await editing.publish(sql, asMember(ines), p.id, { title: "Who to ask", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ask Camille." }] }] }, baseVersion: 1 });
  await editing.startEditing(sql, asMember(ines), p.id);
  await spaces.updateSpace(sql, asMember(camille), s.id, { editing: "some", editors: [ines.id, tom.id] });
  const erasure = "era_" + "c".repeat(26);
  const event = { type: "member.erased" as const, id: "evt_" + "d".repeat(26), data: { id: ines.id, erasure, deadline: new Date(Date.now() + 864e5).toISOString() } };
  assert.equal(await chest.emit(event, POST), 204);
  assert.equal(await chest.emit(event, POST), 204);
  const after = await pages.page(sql, asMember(camille), p.id);
  assert.equal(after.updatedBy, "erased");
  assert.ok((await history.versions(sql, asMember(camille), p.id)).every(v => v.author !== ines.id));
  for (const table of ["pages", "page_versions", "page_files", "spaces", "drafts", "page_locks", "space_editors"]) {
    const [row] = await sql.unsafe(`select count(*)::int as n from ${table} t where row_to_json(t)::text like $1`, [`%${ines.id}%`]);
    assert.equal(row!["n"], 0, table);
  }
  assert.deepEqual(chest.acknowledged, [erasure]);
});

test("an event not signed by the Chest is refused", async () => {
  const response = await POST(new Request("http://tool.test/chest-events", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
  assert.equal(response.status, 401);
});
