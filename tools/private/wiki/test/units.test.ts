import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { AppError as PackageError } from "@argentic/chest-app";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { catalogue } from "../src/i18n/index.ts";
import { db } from "../src/lib/db.ts";
import { lines } from "../src/lib/doc.ts";
import { fromDocx } from "../src/lib/docx.ts";
import { AppError } from "../src/lib/errors.ts";
import { leave, seen } from "../src/lib/lifecycle.ts";
import { boundaryOf, parseMultipart } from "../src/lib/multipart.ts";
import { cut } from "../src/lib/notify.ts";
import { origin } from "../src/lib/origin.ts";
import { page } from "../src/lib/pages.ts";
import { nameOf, people, type Person } from "../src/lib/people.ts";
import { between, isPosition, sequence } from "../src/lib/position.ts";
import { addExample } from "../src/lib/starter.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo } from "./support/members.ts";

// The small rules the larger tests use without naming: positions in a
// tree, people's names (SDK 0.4.1's "no access" too), the team host's
// address, a bell's text cut, a Word document read, the example handbook,
// the events already handled.

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "wiki", members: everyone, former: [{ id: "mbr_" + "z".repeat(26), name: "Zoé Laurent", status: "no_access" }], chest: { publicUrl: null } });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("positions sort between their neighbours, a sequence in order", () => {
  const a = between(null, null);
  const b = between(a, null);
  const mid = between(a, b);
  assert.ok(a < mid && mid < b);
  assert.ok(isPosition(mid));
  const list = sequence(5);
  assert.deepEqual([...list].sort(), list);
});

test("a person is named in the reader's words: former, without access, erased, unknown", async () => {
  const found = await people([camille.id, "mbr_" + "z".repeat(26), "mbr_" + "y".repeat(26)]);
  assert.equal(nameOf(found.get(camille.id), "en"), "Camille Martin");
  assert.equal(nameOf(found.get("mbr_" + "z".repeat(26)), "en"), "Zoé Laurent (no access)");
  assert.equal(nameOf(found.get("mbr_" + "z".repeat(26)), "fr"), "Zoé Laurent (sans accès)");
  assert.equal(nameOf(found.get("mbr_" + "y".repeat(26)), "en"), "Unknown member");
  const former: Person = { id: "mbr_x", name: "Old Name", photo: null, status: "former", locale: "en" };
  assert.equal(nameOf(former, "fr"), "Old Name (ancien membre)");
  assert.equal(nameOf({ ...former, status: "erased" }, "en"), "Former member");
});

test("the team host's address: the Chest's (chest.tool.teamUrl), else the request's", async () => {
  assert.equal(origin(new Request("http://127.0.0.1:3000/chest/export")), "https://wiki-chest.chest.test");
  const saved = process.env["CHEST_TEAM_URL"];
  delete process.env["CHEST_TEAM_URL"];
  try {
    assert.equal(origin(new Request("http://127.0.0.1:3000/chest/export")), "http://127.0.0.1:3000");
  } finally {
    process.env["CHEST_TEAM_URL"] = saved;
  }
});

test("a bell's text is cut by characters, with an ellipsis", () => {
  assert.equal(cut("  Hello\n  world  ", 80), "Hello world");
  assert.equal(cut("é".repeat(10), 5), "éééé…");
});

test("a Word document: its title and headings", () => {
  const read = fromDocx("Livret-accueil.docx", new Uint8Array(readFileSync("test/fixtures/word/Livret-accueil.docx")));
  assert.ok(read.title);
  assert.ok(lines(read.doc).length > 3);
});

test("the services refuse with the package's AppError (an action says it in words)", () => {
  assert.equal(AppError, PackageError);
});

test("the example handbook, in the editor's language; the events handled once; a member who leaves frees their lock", async () => {
  const { sql } = database;
  assert.equal(typeof db, "function");
  const made = await addExample(sql, asMember(camille), catalogue("fr"));
  const first = await page(sql, asMember(camille), made.pageId);
  assert.equal(first.title, catalogue("fr").starter.pages.welcome.title);
  const store = seen(sql);
  assert.equal(await store.has("evt_" + "q".repeat(26)), false);
  await store.add("evt_" + "q".repeat(26));
  assert.equal(await store.has("evt_" + "q".repeat(26)), true);
  await sql`insert into page_locks (page_id, member_id) values (${made.pageId}, ${hugo.id})`;
  await leave(sql, hugo.id);
  assert.equal((await sql`select 1 from page_locks where member_id = ${hugo.id}`).length, 0);
});

test("the import's form is read from its bytes, each file a view of them (no copy)", async () => {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array([1, 2, 3, 13, 10, 45, 45])]), "été.zip");
  form.append("files", new Blob(["# Hi"]), "a.md");
  form.append("name", "Handbook");
  const request = new Request("http://x/", { method: "POST", body: form });
  const type = request.headers.get("content-type");
  const body = new Uint8Array(await request.arrayBuffer());
  const parts = parseMultipart(body, boundaryOf(type)!)!;
  assert.deepEqual(parts.map(p => [p.name, p.fileName, p.data.byteLength]), [["files", "été.zip", 7], ["files", "a.md", 4], ["name", null, 8]]);
  assert.equal(parts[0]!.data.buffer, body.buffer, "a view of the body");
  assert.deepEqual([...parts[0]!.data], [1, 2, 3, 13, 10, 45, 45], "line ends and dashes inside a file kept");
  assert.equal(boundaryOf("application/json"), null);
  assert.equal(parseMultipart(new TextEncoder().encode("junk"), "x"), null);
});
