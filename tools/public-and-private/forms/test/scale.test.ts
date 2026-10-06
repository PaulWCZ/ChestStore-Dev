import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { fakeChest, withMember, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import * as forms from "../src/lib/forms.ts";
import type { Definition } from "../src/shared/model.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines } from "./support/members.ts";
import { readZip } from "./support/zip.ts";

// Forms at its largest — a public form of 10,000 answers (every kind the
// summary reads, 300 of them with a file), an anonymous team form of
// 10,000 — run as the Chest runs it: the built server in a process of its
// own (npm start's flags), whose peak memory (VmHWM, from /proc) must stay
// under the 256 MiB a tool has by default, whose pages stay small, whose
// downloads are written as they are read. On a real PostgreSQL only
// (TEST_DATABASE_URL): PGlite would run in this process and measure itself.
const server = process.env["TEST_DATABASE_URL"];
const memoryLimit = 256 << 20;
const size = 10_000;
if (server) atLeast(5);

let chest: FakeChest, database: TestDatabase, tool: ChildProcess, port = 0;
const peak = () => Number(/VmHWM:\s+(\d+) kB/u.exec(readFileSync(`/proc/${tool.pid}/status`, "utf8"))![1]) * 1024;
const mib = (n: number) => `${(n / 2 ** 20).toFixed(1)} MiB`;
const freePort = () => new Promise<number>(resolve => {
  const probe = createServer().listen(0, "127.0.0.1", () => {
    const { port: p } = probe.address() as { port: number };
    probe.close(() => resolve(p));
  });
});
const url = (path: string) => `http://127.0.0.1:${port}${path}`;
const get = (path: string, who = ines) => fetch(withMember(new Request(url(path)), who));
async function call(name: string, input: unknown, who = ines) {
  const signed = Object.fromEntries(withMember(new Request(url("/chest")), who).headers);
  const response = await fetch(url(`/chest/actions/${name}`), { method: "POST", body: JSON.stringify(input), headers: { ...signed, "content-type": "application/json", "x-tool-action": "1", "sec-fetch-site": "same-origin" } });
  return { status: response.status, ...((await response.json()) as { ok: boolean; value?: unknown; error?: string }) };
}

const opt = (id: string, label: string) => ({ id, label });
const big: Definition = {
  title: "Customer survey",
  intro: "",
  pages: [{
    id: "pagexxxx",
    title: "",
    jumps: [],
    questions: [
      { id: "qnamexxx", kind: "short", title: "Your name", help: "", required: false },
      { id: "qmailxxx", kind: "email", title: "Your email", help: "", required: false },
      { id: "qpickxxx", kind: "choice", title: "How did you find us?", help: "", required: false, other: true, options: [opt("oaaaaaaa", "A friend"), opt("obbbbbbb", "The web"), opt("occccccc", "A shop")] },
      { id: "qdaysxxx", kind: "choices", title: "Which days suit you?", help: "", required: false, options: [opt("odayaaaa", "Monday"), opt("odaybbbb", "Tuesday"), opt("odaycccc", "Friday")] },
      { id: "qnpsxxxx", kind: "scale", title: "Would you recommend us?", help: "", required: false, from: 0, to: 10 },
      { id: "qgridxxx", kind: "matrix", title: "Rate us", help: "", required: false, rows: [opt("rpricexx", "Price"), opt("rspeedxx", "Speed")], options: [opt("cbadxxxx", "Bad"), opt("cokxxxxx", "Ok"), opt("cgoodxxx", "Good")] },
      { id: "qrankxxx", kind: "ranking", title: "Order these", help: "", required: false, options: [opt("ritemaxx", "Price"), opt("ritembxx", "Quality"), opt("ritemcxx", "Speed")] },
      { id: "qlongxxx", kind: "long", title: "Anything else?", help: "", required: false },
      { id: "qfilexxx", kind: "file", title: "A photo", help: "", required: false },
    ],
  }],
};

before(async () => {
  if (!server) return;
  chest = await fakeChest({ tool: "forms", network: {}, members: everyone, capabilities: ["members", "files", "notifications"], chest: { timeZone: "Europe/Paris", organization: "Atelier Martin" } });
  database = await testDatabase();
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

let formId = "", anonymousId = "", anonymousSlug = "";

test(`a public form of ${size.toLocaleString("en")} answers: its list, its answer pages and its summary stay small; the summary is counted by the database`, { skip: !server }, async () => {
  const { sql } = database;
  const made = await forms.create(sql, asMember(ines), { definition: big });
  await forms.publish(sql, asMember(ines), made.id);
  formId = made.id;
  // Each answer a little different: every kind filled, a long text of a
  // few hundred characters, 300 with a stored photo (their bytes below).
  await sql`
    insert into answers (id, form_id, version, email, data, created_at, month, language, status, note)
    select lpad(to_hex(g), 16, '0'), ${formId}, 1, 'person' || g || '@example.com',
      jsonb_build_object(
        'qnamexxx', 'Person ' || g,
        'qmailxxx', 'person' || g || '@example.com',
        'qpickxxx', case when g % 9 = 0 then jsonb_build_object('ids', '[]'::jsonb, 'other', 'Radio ' || g) else jsonb_build_object('ids', jsonb_build_array((array['oaaaaaaa', 'obbbbbbb', 'occccccc'])[1 + g % 3])) end,
        'qdaysxxx', jsonb_build_object('ids', jsonb_build_array((array['odayaaaa', 'odaybbbb', 'odaycccc'])[1 + g % 3], (array['odayaaaa', 'odaybbbb', 'odaycccc'])[1 + (g + 1) % 3])),
        'qnpsxxxx', g % 11,
        'qgridxxx', jsonb_build_object('rows', jsonb_build_object('rpricexx', (array['cbadxxxx', 'cokxxxxx', 'cgoodxxx'])[1 + g % 3], 'rspeedxx', (array['cbadxxxx', 'cokxxxxx', 'cgoodxxx'])[1 + (g / 3) % 3])),
        'qrankxxx', jsonb_build_array((array['ritemaxx', 'ritembxx', 'ritemcxx'])[1 + g % 3], (array['ritemaxx', 'ritembxx', 'ritemcxx'])[1 + (g + 1) % 3], (array['ritemaxx', 'ritembxx', 'ritemcxx'])[1 + (g + 2) % 3]),
        'qlongxxx', repeat('A long answer about the service, the people and the prices. ', 1 + g % 8)
      ) || case when g <= 300 then jsonb_build_object('qfilexxx', jsonb_build_object('file', 'answers/' || ${formId} || '/' || lpad(to_hex(g), 20, '0') || '.jpg', 'name', 'photo ' || g || '.jpg', 'type', 'image/jpeg', 'size', 100000)) else '{}'::jsonb end,
      now() - make_interval(mins => g), date_trunc('month', now() - make_interval(mins => g))::date, 'en',
      (array['new', 'doing', 'done'])[1 + g % 3], case when g % 10 = 0 then 'Called back on ' || g else '' end
    from generate_series(1, ${size}) g`;
  await sql`update forms set answer_count = ${size} where id = ${formId}`;
  const sizes: Record<string, number> = {}, props: Record<string, number> = {}, times: Record<string, number> = {};
  const list = await (await get(`/chest/forms/${formId}/answers`)).text();
  const first = /data-island="AnswersTable"[^>]*data-props="[^"]*?&quot;id&quot;:&quot;([0-9a-f]{16})&quot;/u.exec(list)?.[1];
  assert.ok(first, "the first answer of the list");
  for (const path of [`/chest/forms/${formId}/answers`, `/chest/forms/${formId}/answers?status=done&page=30`, `/chest/forms/${formId}/answers?q=Person%2099`, `/chest/forms/${formId}/answers/${first}`, `/chest/forms/${formId}/summary`, `/chest/forms/${formId}`, "/chest"]) {
    const started = performance.now();
    const response = await get(path);
    const body = await response.text();
    times[path] = Math.round(performance.now() - started);
    assert.equal(response.status, 200, path);
    sizes[path] = body.length;
    const islands = [...body.matchAll(/data-island="(\w+)"[^>]*data-props="([^"]*)"/gu)];
    for (const m of islands) assert.ok(m[2]!.length < 256_000, `${path}: ${m[1]} props ${m[2]!.length} bytes`);
    props[path] = Math.max(0, ...islands.map(m => m[2]!.length));
    assert.ok(body.length < 600_000, `${path}: ${body.length} bytes`);
    assert.ok(times[path]! < 5_000, `${path}: ${times[path]} ms`);
  }
  const summary = await (await get(`/chest/forms/${formId}/summary`)).text();
  assert.match(summary, /10[\s\u202f,.]?000 (answers|réponses)/u);
  console.log(`scale: pages ${JSON.stringify(sizes)}, largest island props ${JSON.stringify(props)}, times ${JSON.stringify(times)}, peak ${mib(peak())}`);
  assert.ok(peak() < memoryLimit, `peak ${mib(peak())}`);
});

test(`its CSV of ${size.toLocaleString("en")} lines is written as it is read`, { skip: !server }, async () => {
  const started = performance.now();
  const response = await get(`/chest/forms/${formId}/export`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  assert.equal(text.trimEnd().split("\r\n").length, size + 1);
  console.log(`scale: CSV ${mib(bytes.length)} in ${Math.round(performance.now() - started)} ms, peak ${mib(peak())}`);
  assert.ok(peak() < memoryLimit, `peak ${mib(peak())}`);
});

test("its archive — the CSV, the form, 300 photos of 100 KB — is written as it is read", { skip: !server }, async () => {
  const photo = new Uint8Array(100_000);
  photo.set([0xff, 0xd8, 0xff]);
  for (let g = 1; g <= 300; g++) chest.files.set(`answers/${formId}/${g.toString(16).padStart(20, "0")}.jpg`, { data: photo, type: "image/jpeg", updated: new Date().toISOString() } as never);
  const started = performance.now();
  const response = await get(`/chest/forms/${formId}/archive`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const entries = readZip(bytes);
  assert.equal(entries.filter(e => e.name.endsWith(".jpg")).length, 300);
  console.log(`scale: archive ${mib(bytes.length)} (${entries.length} files) in ${Math.round(performance.now() - started)} ms, peak ${mib(peak())}`);
  assert.ok(peak() < memoryLimit, `peak ${mib(peak())}`);
});

test(`an anonymous form of ${size.toLocaleString("en")} answers: its texts capped and shuffled, its CSV its summary, one more answer rewrites them all in one statement`, { skip: !server }, async () => {
  const { sql } = database;
  const def: Definition = { title: "Weekly pulse", intro: "", pages: [{ id: "pagepuls", title: "", jumps: [], questions: [
    { id: "qmoodxxx", kind: "rating", title: "Your week", help: "", required: true, steps: 5 },
    { id: "qwhyxxxx", kind: "short", title: "Why?", help: "", required: false },
  ] }] };
  const made = await forms.create(sql, asMember(camille), { definition: def, settings: { audience: "team", anonymous: true } });
  await forms.publish(sql, asMember(camille), made.id);
  anonymousId = made.id;
  anonymousSlug = made.slug;
  await sql`insert into answers (id, form_id, version, data, created_at, month, language)
    select lpad(to_hex(g + 100000), 16, '0'), ${anonymousId}, 1, jsonb_build_object('qmoodxxx', 1 + g % 5, 'qwhyxxxx', 'Because of reason ' || g), null, date_trunc('month', now())::date, 'en'
    from generate_series(1, ${size}) g`;
  await sql`insert into participants (form_id, member) select ${anonymousId}, 'erased' from generate_series(1, ${size})`;
  await sql`update forms set answer_count = ${size} where id = ${anonymousId}`;
  const page = await (await get(`/chest/forms/${anonymousId}/answers`, camille)).text();
  assert.ok(page.length < 200_000, `${page.length} bytes`);
  assert.match(page, /300 (of|sur) 10[\s\u202f,.]?000/u);
  const csv = await (await get(`/chest/forms/${anonymousId}/export`, camille)).text();
  assert.equal(csv.split("\r\n").filter(l => /^Why\?[;,]Because of reason/u.test(l)).length, size);
  const started = performance.now();
  const sent = await call("answerTeam", { slug: anonymousSlug, version: 1, answers: { qmoodxxx: 4, qwhyxxxx: "Fine" } }, hugo);
  const took = Math.round(performance.now() - started);
  assert.equal(sent.ok, true, sent.error);
  const rows = await sql<{ n: number; stamps: number }[]>`select count(*)::int as n, count(distinct xmin::text)::int as stamps from answers where form_id = ${anonymousId}`;
  assert.deepEqual(rows[0], { n: size + 1, stamps: 1 }, "every row rewritten by the last answer");
  console.log(`scale: anonymous answer over ${size} rows in ${took} ms, peak ${mib(peak())}`);
  assert.ok(took < 5_000, `${took} ms`);
  assert.ok(peak() < memoryLimit, `peak ${mib(peak())}`);
});

test("the night's cleanup over all of it stays within the tool's memory", { skip: !server }, async () => {
  const { sql } = database;
  await sql`update forms set retention_months = 1 where id = ${formId}`;
  await sql`update answers set created_at = now() - interval '3 months' where form_id = ${formId} and id <= lpad(to_hex(5000), 16, '0')`;
  const status = await chest.run("cleanup", async request => fetch(url("/chest-schedules"), { method: "POST", headers: request.headers, body: await request.text() }));
  assert.equal(status, 204);
  const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from answers where form_id = ${formId}`) as unknown as [{ n: number }];
  assert.ok(n < size, `${n} answers left`);
  console.log(`scale: cleanup removed ${size - n} answers, peak ${mib(peak())}`);
  assert.ok(peak() < memoryLimit, `peak ${mib(peak())}`);
});
