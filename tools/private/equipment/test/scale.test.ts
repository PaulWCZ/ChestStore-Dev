import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import { limits } from "../src/shared/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { camille, everyone, hugo, sofia } from "./support/members.ts";

// Equipment at its largest — 20,000 items, a person holding 700 of them,
// an inventory under way, a 5 MB import of 5,000 rows × 30 columns — run
// as the Chest runs it: the built server in a process of its own (npm
// start's flags), whose peak memory (VmHWM, from /proc) must stay under
// the 256 MiB a tool has by default, and whose pages stay small. On a
// real PostgreSQL only (TEST_DATABASE_URL): PGlite would run in this
// process and measure itself.
const server = process.env["TEST_DATABASE_URL"];
const memoryLimit = 256 << 20;
if (server) atLeast(4);

let chest: FakeChest, database: TestDatabase, tool: ChildProcess, port = 0;
const peak = () => Number(/VmHWM:\s+(\d+) kB/u.exec(readFileSync(`/proc/${tool.pid}/status`, "utf8"))![1]) * 1024;
const freePort = () => new Promise<number>(resolve => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const { port: p } = probe.address() as { port: number };
    probe.close(() => resolve(p));
  });
});
const url = (path: string) => `http://127.0.0.1:${port}${path}`;
const get = (path: string, who = sofia) => fetch(withMember(new Request(url(path)), who));
async function call(name: string, input: unknown) {
  // The Chest's assertion, signed for this member, on a POST of our own.
  const signed = Object.fromEntries(withMember(new Request(url("/chest")), sofia).headers);
  const response = await fetch(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { ...signed, "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin" } });
  const text = await response.text();
  return { status: response.status, bytes: Buffer.byteLength(text), ...(JSON.parse(text) as { ok: boolean; value?: any; error?: string }) };
}

before(async () => {
  if (!server) return;
  database = await testDatabase();
  chest = await fakeChest({ network: {}, tool: "equipment", members: everyone });
  port = await freePort();
  tool = spawn(process.execPath, ["--optimize-for-size", "dist/test/main.js"], { env: { ...process.env, PORT: String(port), NODE_ENV: "production" }, stdio: ["ignore", "ignore", "inherit"] });
  for (let i = 0; i < 100; i++) {
    try { await fetch(url("/")); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
});
after(async () => {
  if (!server) return;
  tool.kill();
  await chest.close();
  await database.close();
});

// 5,000 rows of 30 columns, just under 5 MB: name, category, serial,
// dates, price, supplier, notes, and 20 columns of the company's own (the
// most a category takes), each a value of 38 characters.
function bigFile(): string {
  const own = Array.from({ length: 20 }, (_, k) => `Own field ${k + 1}`);
  const header = ["Name", "Category", "Serial number", "Asset tag", "Purchase date", "Purchase cost", "Supplier", "Warranty", "Notes", "Status", ...own];
  const lines = [header.join(",")];
  for (let r = 1; r <= limits.importRows; r++) {
    const cells = [`Imported laptop ${r}`, "Laptop", `SN-BIG-${r}`, `BIG-${r}`, "2024-03-01", "1299.90", "Supplier of laptops", "2027-03-01", `Bought for the team, row ${r} of the file`, "In stock"];
    for (let k = 0; k < own.length; k++) cells.push(`value ${k} of row ${r}`.padEnd(38, "x"));
    lines.push(cells.join(","));
  }
  return lines.join("\n") + "\n";
}

test("a 5 MB import (5,000 rows × 30 columns): a small preview, then imported, the server under 256 MiB", { skip: !server }, async () => {
  const text = bigFile();
  assert.ok(text.length <= limits.importBytes && text.length > limits.importBytes * 0.8, `${text.length} characters`);
  await get("/chest");
  const atRest = peak();
  const preview = await call("checkImport", { source: "csv", text });
  assert.equal(preview.ok, true, preview.error);
  assert.equal(preview.value.total, limits.importRows);
  assert.equal(preview.value.rows.length, 50);
  assert.ok(preview.bytes < 200_000, `the preview's answer: ${preview.bytes} bytes`);
  const afterPreview = peak();
  const run = await call("runImport", { source: "csv", text });
  assert.equal(run.value.imported, limits.importRows);
  console.log(`scale: peak at rest ${(atRest / 2 ** 20).toFixed(1)} MiB; import of ${text.length} characters — preview answer ${preview.bytes} bytes, peak after preview ${(afterPreview / 2 ** 20).toFixed(1)} MiB, after import ${(peak() / 2 ** 20).toFixed(1)} MiB`);
  assert.ok(peak() < memoryLimit, `peak ${(peak() / 2 ** 20).toFixed(1)} MiB`);
});

test("20,000 items: the overview, the list, a person holding 700, the inventory under way stay small pages", { skip: !server }, async () => {
  const { sql } = database;
  const [laptop] = await sql<{ id: string }[]>`select id::text from categories where key = 'laptop'`;
  const [counted] = await sql<{ n: number }[]>`select count(*)::int as n from items where deleted_at is null`;
  const n = counted!.n;
  await sql`insert into items (category_id, tag, name, serial, status, holder, held_since, created_by)
    select ${laptop!.id}, 'S-' || g, 'Scale laptop ' || g, 'SN-S-' || g, case when g <= 700 then 'in_use' else 'in_stock' end,
      case when g <= 700 then ${hugo.id} end, case when g <= 700 then current_date end, ${camille.id}
    from generate_series(1, ${limits.items - n}) g`;
  await sql`insert into inventories (started_by) values (${camille.id})`;
  await sql`insert into sightings (inventory_id, item_id, seen_by) select (select id from inventories where closed_at is null), id, ${camille.id} from items where tag like 'S-%' and substring(tag from 3)::int <= 3000`;
  const sizes: Record<string, number> = {};
  for (const path of ["/chest", "/chest/items", "/chest/inventory", "/chest/inventory?q=Scale&page=40", `/chest/people/${hugo.id}`]) {
    const started = performance.now();
    const response = await get(path);
    const body = await response.text();
    assert.equal(response.status, 200, path);
    sizes[path] = body.length;
    assert.ok(body.length < 700_000, `${path}: ${body.length} bytes`);
    assert.ok(performance.now() - started < 5_000, `${path}: ${Math.round(performance.now() - started)} ms`);
  }
  // Labels: 240 at most on the sheets (each a QR code drawn in SVG).
  const labels = await (await get("/chest/labels?q=Scale")).text();
  assert.ok(labels.length < 1_500_000, `labels: ${labels.length} bytes`);
  const inventory = await (await get("/chest/inventory")).text();
  assert.match(inventory, /3[ ,. ]?000 of 20[ ,. ]?000 seen/u);
  console.log(`scale: pages ${JSON.stringify(sizes)}, peak ${(peak() / 2 ** 20).toFixed(1)} MiB`);
  assert.ok(peak() < memoryLimit, `peak ${(peak() / 2 ** 20).toFixed(1)} MiB; pages ${JSON.stringify(sizes)}`);
});

test("the Give dialog's offer is read when it opens: 60 at most, found as one types", { skip: !server }, async () => {
  const offer = await call("stockOffer", { q: "", consumables: true });
  assert.ok(offer.value.length <= 60 && offer.value.length > 0);
  const found = await call("stockOffer", { q: "SN-S-14999", consumables: false, person: hugo.id });
  assert.deepEqual(found.value.map((r: { tag: string }) => r.tag), ["S-14999"]);
});

test("the export of 20,000 items is written as it is read, the server under 256 MiB", { skip: !server }, async () => {
  const response = await get("/chest/export");
  const text = await response.text();
  assert.equal(text.split("\r\n").length - 2, limits.items);
  console.log(`scale: export ${text.length} characters, peak ${(peak() / 2 ** 20).toFixed(1)} MiB`);
  assert.ok(peak() < memoryLimit, `peak ${(peak() / 2 ** 20).toFixed(1)} MiB`);
});
