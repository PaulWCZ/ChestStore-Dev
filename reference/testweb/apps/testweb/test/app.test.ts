import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createApp, version } from "../src/app.js";
import type { Database, Probe, ProbeTarget, Schema, Session } from "../src/database.js";
import type { Files, LinkOptions, QuotaProbe, UploadOptions } from "../src/files.js";
import { ChestLifecycle, type LifecycleView } from "../src/lifecycle.js";
import { ChestSchedules, type Ran } from "../src/schedules.js";
import { ChestAssistant } from "../src/assistant.js";
import { ChestTeam } from "../src/members.js";
import { maxNotes, type Note, type NoteStore } from "../src/notes.js";
import { QuotaExceeded } from "../../../packages/chest-client/src/errors.js";
import type { FileData, FileObject, FilePage } from "../../../packages/chest-client/src/files.js";
import type { Member } from "../../../packages/chest-client/src/member.js";
import { fakeChest, signAssertion, type FakeChest } from "../../../packages/chest-client/src/testing.js";

// The tool's database, played in memory: the routes are the tool's, the
// queries PostgreSQL's (proved in the laboratory's VM).
class MemoryNotes implements NoteStore {
  #notes: Note[] = [];
  #next = 1;
  async list(): Promise<Note[]> { return this.#notes.map(note => ({ ...note })); }
  async add(text: string, author: string): Promise<Note | null> {
    if (this.#notes.length >= maxNotes) return null;
    const note = { id: this.#next++, text, author };
    this.#notes.push(note);
    return { ...note };
  }
  async remove(id: number): Promise<boolean> {
    const before = this.#notes.length;
    this.#notes = this.#notes.filter(note => note.id !== id);
    return this.#notes.length !== before;
  }
  async forget(author: string): Promise<number> {
    const theirs = this.#notes.filter(note => note.author === author);
    for (const note of theirs) note.author = "erased";
    return theirs.length;
  }
}
const notes = new MemoryNotes();
const probes: ProbeTarget[] = [];
const database: Database = {
  async schema(): Promise<Schema> { return { migrations: ["0001_notes.sql"], columns: ["id", "text", "author", "created_at"] }; },
  async session(): Promise<Session> { return { timeZone: "Europe/Paris", today: "2026-09-30" }; },
  async probe(target: ProbeTarget): Promise<Probe> { probes.push(target); return { target, outcome: "refused", code: "28000" }; },
};

// The Chest's files, played in memory: the SDK against the broker is
// tested in the SDK, the broker in the Chest.
class MemoryFiles implements Files {
  readonly kept = new Map<string, { type: string; data: Uint8Array }>();
  async put(name: string, data: Uint8Array, type: string): Promise<FileObject> {
    if (data.byteLength > 16) throw new QuotaExceeded();
    this.kept.set(name, { type, data });
    return { name, type, size: data.byteLength, sha256: "0".repeat(64), updated: "2026-09-25T00:00:00.000Z" };
  }
  async get(name: string): Promise<FileData | null> {
    const file = this.kept.get(name);
    return file ? { data: file.data, type: file.type, size: file.data.byteLength } : null;
  }
  async stat(name: string): Promise<FileObject | null> {
    const file = this.kept.get(name);
    return file ? { name, type: file.type, size: file.data.byteLength, sha256: "0".repeat(64), updated: "2026-09-25T00:00:00.000Z" } : null;
  }
  async list(): Promise<FilePage> { return { files: [...this.kept.keys()].sort().map(name => ({ name, type: this.kept.get(name)!.type, size: this.kept.get(name)!.data.byteLength, sha256: "0".repeat(64), updated: "2026-09-25T00:00:00.000Z" })), next: null }; }
  async remove(name: string): Promise<boolean> { return this.kept.delete(name); }
  async url(name: string, options: LinkOptions = {}): Promise<{ url: string; expiresIn: number }> { return { url: "https://web-chest.atelier.example/_chest/files/" + name.length + (options.thumbnail ? "." + options.thumbnail : ""), expiresIn: 900 }; }
  readonly uploads: [string, UploadOptions][] = [];
  async uploadUrl(name: string, options: UploadOptions = {}): Promise<{ url: string; method: "PUT"; expiresIn: number }> {
    this.uploads.push([name, options]);
    return { url: "https://web-chest.atelier.example/_chest/files/upload/" + name.length, method: "PUT", expiresIn: options.expiresIn ?? 900 };
  }
  async quotaProbe(): Promise<QuotaProbe> { return { tooLarge: 413, quota: "quota_exceeded", written: 3 }; }
}
const files = new MemoryFiles();

// The members of the tool, as the SDK's fake Chest keeps them: the owner,
// and bob, an editor; a reader is bob with another role.
const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
const owner: Member = { id: id("alice"), firstName: "Alice", lastName: "Martin", name: "Alice Martin", photo: null, role: "reader", isAdmin: true, isBuilder: false, groups: [], language: "en", timeZone: "America/New_York" };
const editor: Member = { id: id("bob"), firstName: "", lastName: "", name: "Bob", photo: null, role: "editor", isAdmin: false, isBuilder: false, groups: [], language: "fr", timeZone: "Europe/Paris" };
const reader: Member = { ...editor, role: "reader" };

// The tool behind a plain HTTP server, as the Chest's launcher reaches it,
// beside a fake Chest (the SDK's testing module): its assertions signed as
// the Chest's front signs them, its members read from it.
let chest: FakeChest;
let server: Server;
let base: string;
before(async () => {
  process.env["CHEST_TOOL"] = "web";
  chest = await fakeChest({ members: [owner, editor], capabilities: ["members", "notifications", "ai"], ai: { cap: 0.0001 }, chest: { organization: "Atelier & Fils", timeZone: "Europe/Paris", language: "fr", currency: "CHF", publicUrl: "https://forms.atelier.example" } });
  server = createServer(createApp(notes, database, files, new ChestTeam(), new ChestLifecycle(notes), new ChestSchedules(), new ChestAssistant()));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = "http://127.0.0.1:" + String((server.address() as AddressInfo).port);
});
after(async () => { server.close(); await chest.close(); delete process.env["CHEST_TOOL"]; });

function call(path: string, who?: Member, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (who) headers.set("Chest-Member", signAssertion(who));
  return fetch(base + path, { ...init, headers });
}
const post = (who: Member | undefined, body: unknown, type = "application/json"): Promise<Response> => call("/chest/api/notes", who, { method: "POST", headers: { "Content-Type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("the public part answers anyone, shows its version and sees nobody, even with a forged assertion", async () => {
  const page = await call("/");
  assert.equal(page.status, 200);
  const text = await page.text();
  assert.match(text, /This page is public\./u);
  assert.ok(text.includes("Version: " + version));
  assert.ok(text.includes("Public address: https://forms.atelier.example"));
  assert.deepEqual(await (await call("/api/whoami", undefined, { headers: { "Chest-Member": "forged.forged.forged" } })).json(), { member: null });
  const css = await call("/static/site.css");
  assert.equal(css.status, 200);
  assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal((await call("/absent")).status, 404);
  assert.equal((await call("/", undefined, { method: "POST" })).status, 405);
});

test("the team part is nobody's without an assertion", async () => {
  assert.equal((await call("/chest")).status, 401);
  assert.equal((await call("/chest/app.js")).status, 401);
  assert.equal((await call("/chest/api/notes")).status, 401);
  assert.equal((await post(undefined, { text: "x" })).status, 401);
  assert.equal((await call("/chest", undefined, { headers: { "Chest-Member": "forged.forged.forged" } })).status, 401);
});

test("a member sees their name and role; editors, admins and builders write, readers read", async () => {
  const page = await call("/chest", owner);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/u);
  const html = await page.text();
  assert.ok(html.includes("Hello, Alice Martin"));
  assert.ok(html.includes("Your role: reader"));
  // The Chest, as the tool is told it and as its database is in it; the
  // language is the member's.
  assert.ok(html.includes("Organization: Atelier &amp; Fils · Language: en"));
  assert.ok(html.includes("Time zone: Europe/Paris · Today: "));
  assert.ok(html.includes("Database time zone: Europe/Paris · Database today: 2026-09-30"));
  // The member's own zone: where the tool shows them times.
  assert.ok(html.includes("Your time zone: America/New_York"));
  const told = await (await call("/chest/api/chest", owner)).json() as Record<string, unknown>;
  assert.deepEqual({ ...told, today: "" }, { organization: "Atelier & Fils", timeZone: "Europe/Paris", currency: "CHF", teamUrl: "https://web-chest.chest.test", publicUrl: "https://forms.atelier.example", today: "", language: "fr", database: { timeZone: "Europe/Paris", today: "2026-09-30" } });
  assert.ok(html.includes("Currency: CHF"));
  assert.ok(html.includes("Team address: https://web-chest.chest.test · Public address: https://forms.atelier.example"));
  assert.match(String(told["today"]), /^\d{4}-\d{2}-\d{2}$/u);
  assert.ok(html.includes("TESTWEB_GREETING: not set"));
  assert.ok(html.includes("<label for=\"note\">New note</label>"));
  // The variable the tool expects, once the Chest gives it: escaped as any text.
  process.env["TESTWEB_GREETING"] = "Hello <everyone>, é";
  try {
    assert.ok((await (await call("/chest", owner)).text()).includes("TESTWEB_GREETING: Hello &lt;everyone&gt;, é"));
  } finally {
    delete process.env["TESTWEB_GREETING"];
  }
  assert.equal((await call("/chest/app.js", owner)).headers.get("content-type"), "text/javascript; charset=utf-8");
  // The owner administers the Chest: they write whatever their role.
  const created = await post(owner, { text: "  First note  " });
  assert.equal(created.status, 201);
  const note = await created.json() as { id: number; text: string; author: string };
  assert.deepEqual({ text: note.text, author: note.author }, { text: "First note", author: owner.id });
  // A reader lists, never writes nor removes.
  assert.ok(!(await (await call("/chest", reader)).text()).includes("New note"));
  assert.deepEqual(await (await call("/chest/api/notes", reader)).json(), { notes: [note], canWrite: false });
  assert.equal((await post(reader, { text: "Refused" })).status, 403);
  assert.equal((await call("/chest/api/notes/" + String(note.id), reader, { method: "DELETE" })).status, 403);
  // An editor removes it; it is gone once.
  assert.equal((await call("/chest/api/notes/" + String(note.id), editor, { method: "DELETE" })).status, 204);
  assert.equal((await call("/chest/api/notes/" + String(note.id), editor, { method: "DELETE" })).status, 404);
  assert.deepEqual(await (await call("/chest/api/notes", editor)).json(), { notes: [], canWrite: true });
});

test("names are escaped, notes bounded, other kinds of body refused", async () => {
  assert.ok((await (await call("/chest", { ...editor, name: "<script>x</script>" })).text()).includes("Hello, &lt;script&gt;x&lt;/script&gt;"));
  for (const body of [{ text: "" }, { text: "   " }, { text: "é".repeat(281) }, { text: "a\u0000b" }, { text: "a‮b" }, { text: 3 }, { text: "x", extra: 1 }, ["x"], "not json"]) {
    assert.equal((await post(editor, body)).status, 400, JSON.stringify(body));
  }
  // A form or text/plain post of another site never reaches a write.
  assert.equal((await post(editor, JSON.stringify({ text: "x" }), "text/plain")).status, 400);
  assert.equal((await post(editor, { text: "x".repeat(5000) })).status, 400);
  assert.equal((await post(editor, { text: "é".repeat(280) })).status, 201);
  for (let i = 1; i < maxNotes; i++) assert.equal((await post(editor, { text: "Note " + String(i) })).status, 201);
  assert.equal((await post(editor, { text: "De trop" })).status, 409);
  assert.equal(((await (await call("/chest/api/notes", editor)).json()) as { notes: unknown[] }).notes.length, maxNotes);
});

test("the outbound network is tried by a member, on the fixed targets only", async () => {
  assert.equal((await call("/chest/api/egress?target=allowed")).status, 401);
  for (const query of ["", "?target=", "?target=https://evil.example/", "?target=allowed&target=direct", "?target=allowed&url=x"]) {
    assert.equal((await call("/chest/api/egress" + query, reader)).status, 400, query);
  }
  assert.equal((await call("/chest/api/egress?target=allowed", reader, { method: "POST" })).status, 405);
});

test("the database is read and probed by a member, on the fixed targets only", async () => {
  assert.equal((await call("/chest/api/database")).status, 401);
  assert.deepEqual(await (await call("/chest/api/database", reader)).json(), { migrations: ["0001_notes.sql"], columns: ["id", "text", "author", "created_at"] });
  assert.equal((await call("/chest/api/database", reader, { method: "POST" })).status, 405);
  assert.equal((await call("/chest/api/db-probe?target=keycloak")).status, 401);
  for (const query of ["", "?target=", "?target=postgres://x", "?target=other&target=admin", "?target=other&host=x"]) {
    assert.equal((await call("/chest/api/db-probe" + query, reader)).status, 400, query);
  }
  assert.deepEqual(await (await call("/chest/api/db-probe?target=other", reader)).json(), { target: "other", outcome: "refused", code: "28000" });
  assert.deepEqual(probes, ["other"]);
});

test("files are listed and read by a member, put and removed by who writes, and linked by the Chest", async () => {
  assert.equal((await call("/chest/api/files")).status, 401);
  const put = (who: Member, name: string, body: string, type = "text/plain"): Promise<Response> => call("/chest/api/files/" + name, who, { method: "PUT", headers: { "Content-Type": type }, body });
  assert.equal((await put(reader, "notes/a.txt", "hello")).status, 403);
  assert.deepEqual(await (await put(editor, "notes/a.txt", "hello")).json(), { name: "notes/a.txt", type: "text/plain", size: 5, sha256: "0".repeat(64), updated: "2026-09-25T00:00:00.000Z" });
  assert.deepEqual(await (await call("/chest/api/files/notes/a.txt", reader)).json(), { name: "notes/a.txt", type: "text/plain", size: 5, data: Buffer.from("hello").toString("base64") });
  assert.deepEqual((await (await call("/chest/api/files", reader)).json() as FilePage).files.map(f => f.name), ["notes/a.txt"]);
  assert.deepEqual(await (await call("/chest/api/files/url", reader, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "notes/a.txt" }) })).json(), { url: "https://web-chest.atelier.example/_chest/files/11", expiresIn: 900 });
  // The Chest's refusal, with its code and status.
  const refused = await put(editor, "big", "x".repeat(17));
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { error: "quota_exceeded" });
  assert.equal((await put(editor, "huge", "x".repeat((64 << 10) + 1))).status, 413);
  assert.equal((await call("/chest/api/files/notes/a.txt", reader, { method: "DELETE" })).status, 403);
  assert.equal((await call("/chest/api/files/notes/a.txt", editor, { method: "DELETE" })).status, 204);
  assert.equal((await call("/chest/api/files/notes/a.txt", editor, { method: "DELETE" })).status, 404);
  assert.equal((await call("/chest/api/files/notes/a.txt", reader)).status, 404);
  assert.equal((await call("/chest/api/quota-probe", reader, { method: "POST" })).status, 403);
  assert.deepEqual(await (await call("/chest/api/quota-probe", owner, { method: "POST" })).json(), { tooLarge: 413, quota: "quota_exceeded", written: 3 });
  assert.equal((await call("/chest/api/quota-probe", owner)).status, 405);
});

test("the members of the tool are read from the Chest: the page, the member asserted, a search, one, a lookup, the groups", async () => {
  for (const path of ["/chest/members", "/chest/api/me", "/chest/api/members", "/chest/api/members/" + owner.id, "/chest/api/groups"]) assert.equal((await call(path)).status, 401, path);
  const page = await (await call("/chest/members", reader)).text();
  assert.ok(page.includes("2 members have this tool.") && page.includes("Alice Martin · reader") && page.includes("Bob · editor"));
  assert.ok((await (await call("/chest", reader)).text()).includes(`<a href="/chest/members">Members</a>`));
  assert.deepEqual(await (await call("/chest/api/me", reader)).json(), { member: reader });
  const found = await (await call("/chest/api/members?q=bo", owner)).json() as { members: Member[]; next: string | null };
  assert.deepEqual([found.members.map(m => m.id), found.next], [[editor.id], null]);
  assert.equal(found.members[0]?.email, undefined);
  assert.equal((await call("/chest/api/members?x=1", owner)).status, 400);
  assert.deepEqual(await (await call("/chest/api/members/" + editor.id, owner)).json(), editor);
  assert.equal((await call("/chest/api/members/" + id("mallory"), owner)).status, 404);
  const invalid = await call("/chest/api/members/alice", owner);
  assert.deepEqual([invalid.status, await invalid.json()], [400, { error: "invalid_id" }]);
  const lookup = await call("/chest/api/members/lookup", owner, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id("mallory"), owner.id] }) });
  assert.deepEqual(await lookup.json(), { members: [owner], former: [], unknown: [id("mallory")] });
  assert.equal((await call("/chest/api/members/lookup", owner, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: "x" }) })).status, 400);
  assert.equal((await call("/chest/api/members/lookup", owner)).status, 405);
  assert.deepEqual(await (await call("/chest/api/groups", owner)).json(), { groups: [] });
});

test("an upload is authorised to who writes — photos into photos/, images of 10 MiB —, then described and linked by its thumbnail", async () => {
  const post = (who: Member, path: string, body: unknown): Promise<Response> => call(path, who, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post(reader, "/chest/api/files/upload-url", { name: "photos/" })).status, 403);
  assert.deepEqual(await (await post(editor, "/chest/api/files/upload-url", { name: "photos/" })).json(), { url: "https://web-chest.atelier.example/_chest/files/upload/7", method: "PUT", expiresIn: 900 });
  assert.deepEqual(await (await post(editor, "/chest/api/files/upload-url", { name: "doc.txt", expiresIn: 1 })).json(), { url: "https://web-chest.atelier.example/_chest/files/upload/7", method: "PUT", expiresIn: 1 });
  assert.deepEqual(files.uploads, [["photos/", { types: ["image/*"], maxSize: 10 << 20 }], ["doc.txt", { expiresIn: 1 }]]);
  for (const bad of [{}, { name: 1 }, { name: "a", other: 1 }, { name: "a", expiresIn: "1" }]) assert.equal((await post(editor, "/chest/api/files/upload-url", bad)).status, 400);
  await files.put("photos/cat.png", new Uint8Array([1, 2]), "image/png");
  assert.deepEqual(await (await post(reader, "/chest/api/files/stat", { name: "photos/cat.png" })).json(), { name: "photos/cat.png", type: "image/png", size: 2, sha256: "0".repeat(64), updated: "2026-09-25T00:00:00.000Z" });
  assert.equal((await post(reader, "/chest/api/files/stat", { name: "none" })).status, 404);
  assert.deepEqual(await (await post(reader, "/chest/api/files/url", { name: "photos/cat.png", thumbnail: 256 })).json(), { url: "https://web-chest.atelier.example/_chest/files/14.256", expiresIn: 900 });
  assert.equal((await post(reader, "/chest/api/files/url", { name: "photos/cat.png", thumbnail: 300 })).status, 400);
  await files.remove("photos/cat.png");
});

test("who writes tells members through the Chest: an item of their inbox, withdrawn by its key, the counter of the tile", async () => {
  const post = (who: Member, path: string, body: unknown): Promise<Response> => call(path, who, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post(reader, "/chest/api/notify", { members: [owner.id], title: "Hi" })).status, 403);
  const sent = await post(editor, "/chest/api/notify", { members: [owner.id, id("mallory")], title: "Note added", body: "By Bob", path: "/chest/api/notes", key: "note:1" });
  assert.deepEqual(await sent.json(), { delivered: [owner.id], skipped: [id("mallory")] });
  assert.deepEqual(chest.notifications, [{ member: owner.id, title: "Note added", body: "By Bob", path: "/chest/api/notes", key: "note:1" }]);
  assert.equal((await post(editor, "/chest/api/notify", { members: [owner.id], title: "x", path: "/public" })).status, 400);
  assert.equal((await post(editor, "/chest/api/withdraw", { key: "note:1" })).status, 204);
  assert.deepEqual(chest.notifications, []);
  assert.deepEqual(await (await post(editor, "/chest/api/badge", { member: owner.id, count: 3 })).json(), { set: true });
  assert.deepEqual(await (await post(editor, "/chest/api/badge", { member: id("mallory"), count: 3 })).json(), { set: false });
  assert.equal(chest.badges.get(owner.id), 3);
  for (const bad of [{}, { title: "x" }, { members: "x", title: "x" }]) assert.equal((await post(editor, "/chest/api/notify", bad)).status, 400);
  assert.equal((await call("/chest/api/badge", editor)).status, 405);
});

test("any member has a text summarised by the Chest's AI, whole or streamed, and the tool keeps working once AI is paused", async () => {
  const summarise = (who: Member, body: unknown): Promise<Response> => call("/chest/api/summary", who, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const whole = await (await summarise(reader, { text: "Meeting moved to Friday" })).json() as { text: string; cost: number };
  assert.equal(whole.text, "Meeting moved to Friday");
  assert.ok(whole.cost > 0);
  const sent = chest.ai.at(-1)?.body as { model: string; max_tokens: number; member: string; stream?: boolean };
  assert.deepEqual([sent.model, sent.max_tokens, sent.member, sent.stream], ["default", 200, reader.id, undefined]);
  // Streamed until the month's cap pauses AI: the page says so, the rest works.
  let paused: string | undefined;
  for (let i = 0; i < 50 && paused === undefined; i++) {
    const answer = await (await summarise(owner, { text: "Streamed words", stream: true })).json() as { text?: string; paused?: string };
    if (answer.paused) paused = answer.paused;
    else assert.equal(answer.text, "Streamed words");
  }
  assert.equal(paused, "cap_reached");
  assert.equal((await call("/chest/api/notes", owner)).status, 200);
  for (const bad of [{}, { text: "" }, { text: "x", stream: "yes" }, { text: "x", other: 1 }]) assert.equal((await summarise(owner, bad)).status, 400);
  assert.equal((await call("/chest/api/summary", owner)).status, 405);
});

test("the Chest's events are received on /chest-events: each once, held on demand, an erasure anonymises and is acknowledged", async () => {
  const view = async (): Promise<LifecycleView> => await (await call("/chest/api/events", owner)).json() as LifecycleView;
  const hold = (who: Member, held: unknown): Promise<Response> => call("/chest/api/events/hold", who, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ held }) });
  const revoked = { id: "evt_" + "r".repeat(26), type: "access.revoked" as const, data: { id: editor.id } };
  assert.equal(await chest.emit(revoked, base), 204);
  assert.equal(await chest.emit(revoked, base), 204);
  assert.deepEqual((await view()).events.map(e => [e.id, e.type, e.member]), [[revoked.id, "access.revoked", editor.id]]);
  // Not the Chest's: refused, nothing kept; not a POST: 405.
  assert.equal((await fetch(base + "/chest-events", { method: "POST", body: "{}" })).status, 401);
  assert.equal((await call("/chest-events")).status, 405);
  // Held, a delivery is refused and kept apart; released, the same event is received.
  assert.equal((await hold(reader, true)).status, 403);
  assert.equal((await hold(editor, "yes")).status, 400);
  assert.equal((await hold(editor, true)).status, 204);
  const removed = { id: "evt_" + "m".repeat(26), type: "member.removed" as const, data: { id: editor.id } };
  assert.equal(await chest.emit(removed, base), 503);
  assert.deepEqual([(await view()).refused, (await view()).held], [[removed.id], true]);
  assert.equal((await hold(editor, false)).status, 204);
  assert.equal(await chest.emit(removed, base), 204);
  assert.deepEqual((await view()).events.map(e => e.id), [revoked.id, removed.id]);
  // The erasure of Bob: his notes anonymised, then acknowledged to the Chest.
  const kept = await notes.list();
  if (kept.length >= maxNotes) await notes.remove(kept[0]!.id);
  const note = await notes.add("Bob's note", editor.id);
  const erasure = "era_" + "e".repeat(26);
  assert.equal(await chest.emit({ type: "member.erased", data: { id: editor.id, erasure, deadline: "2026-10-28T10:00:00Z" } }, base), 204);
  assert.equal((await notes.list()).find(n => n.id === note!.id)?.author, "erased");
  assert.deepEqual(chest.acknowledged, [erasure]);
  assert.equal((await view()).events.at(-1)?.type, "member.erased");
  await notes.remove(note!.id);
});

test("the runs of its schedules are received on /chest-schedules: each once, a schedule it does not have refused", async () => {
  const runs = async (): Promise<Ran[]> => (await (await call("/chest/api/schedules", owner)).json() as { runs: Ran[] }).runs;
  const id = "run_" + "s".repeat(26);
  assert.equal(await chest.run("morning", base, { id, scheduledAt: "2026-10-05T05:30:00Z" }), 204);
  assert.equal(await chest.run("morning", base, { id, attempt: 2 }), 204);
  assert.deepEqual((await runs()).map(r => [r.id, r.name, r.scheduledAt, r.attempt]), [[id, "morning", "2026-10-05T05:30:00Z", 1]]);
  assert.equal(await chest.run("evening", base), 404);
  // Not the Chest's: refused; not a POST: 405; the list is for members.
  assert.equal((await fetch(base + "/chest-schedules", { method: "POST", body: "{}" })).status, 401);
  assert.equal((await call("/chest-schedules")).status, 405);
  assert.equal((await call("/chest/api/schedules")).status, 401);
});

test("the server listens on PORT and exits cleanly on SIGTERM", async () => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = (probe.address() as AddressInfo).port;
  await new Promise(resolve => probe.close(resolve));
  const entry = fileURLToPath(new URL("../src/server.js", import.meta.url));
  // Without the database the Chest gives, the tool does not start.
  const refused = spawn(process.execPath, [entry], { env: { ...process.env, PORT: String(port), DATABASE_URL: "" }, stdio: "ignore" });
  const [refusedCode] = await once(refused, "exit") as [number | null];
  assert.notEqual(refusedCode, 0);
  // With it, it starts; it connects at its first query, none here.
  const child = spawn(process.execPath, [entry], { env: { ...process.env, PORT: String(port), DATABASE_URL: `postgres://t_web:${"A".repeat(43)}@127.0.0.1:${port}/t_web?sslmode=disable` }, stdio: ["ignore", "pipe", "inherit"] });
  const [line] = await once(child.stdout, "data") as [Buffer];
  assert.match(line.toString(), /listening on 127\.0\.0\.1:/u);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  child.kill("SIGTERM");
  const [code, signal] = await once(child, "exit") as [number | null, string | null];
  assert.deepEqual([code, signal], [0, null]);
});
