import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { onEvent, onSchedule } from "../src/lib/deliveries.ts";
import { AppError } from "@argentic/chest-app";
import { listCategories } from "../src/lib/categories.ts";
import { allFields } from "../src/lib/fields.ts";
import { applyImport, previewImport } from "../src/lib/importer.ts";
import * as intune from "../src/lib/intune.ts";
import * as items from "../src/lib/items.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea, nora, sofia } from "./support/members.ts";

// Microsoft Intune, read only. The tool calls Microsoft with plain fetch();
// the fake Chest's network (studio.15) answers the two declared hosts as
// Microsoft's documentation shows (lib/intune.ts, sources) and refuses any
// other, as the Chest's egress proxy does; the test records what was asked.

let database: TestDatabase;
let chest: FakeChest;
const M = asMember(camille), H = asMember(hugo);
const env = { INTUNE_TENANT_ID: "contoso.onmicrosoft.com", INTUNE_CLIENT_ID: "00001111-aaaa-2222-bbbb-3333cccc4444", INTUNE_CLIENT_SECRET: "s3cret~value" };
const saved = { ...process.env };

// Each member's sign-in address, as the Chest knows it (never given to the
// tool: it only asks which member an address is).
const withMail = everyone.map(p => ({ ...p, email: p.id.slice(4).replace(/a+$/u, "") + "@contoso.com" }));
const address = (who: { id: string }) => withMail.find(p => p.id === who.id)!.email;
// What Microsoft answers, set by each test.
let microsoft: (request: Request) => Promise<Response> = async () => new Response(null, { status: 500 });

before(async () => {
  database = await testDatabase();
  chest = await fakeChest({
    tool: "equipment",
    members: withMail,
    network: { "login.microsoftonline.com": request => microsoft(request), "graph.microsoft.com": request => microsoft(request) },
  });
});
after(async () => {
  await chest.close();
  await database.close();
});
afterEach(() => {
  microsoft = async () => new Response(null, { status: 500 });
  for (const k of Object.keys(env)) delete process.env[k];
  Object.assign(process.env, saved);
});

type Call = { url: string; method: string; headers: Headers; body: string };
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });

// A Graph with these devices, two per page.
function graph(devices: Record<string, unknown>[], options: { token?: Response; page?: (n: number) => Response | null } = {}) {
  const calls: Call[] = [];
  microsoft = async request => {
    const url = request.url;
    calls.push({ url, method: request.method, headers: new Headers(request.headers), body: await request.text() });
    if (url.startsWith("https://login.microsoftonline.com/")) return options.token ?? json({ token_type: "Bearer", expires_in: 3599, access_token: "eyJ.fake" });
    const skip = Number(new URL(url).searchParams.get("$skiptoken") ?? 0);
    const special = options.page?.(skip);
    if (special) return special;
    const next = skip + 2 < devices.length ? `https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$skiptoken=${skip + 2}` : undefined;
    return json({ value: devices.slice(skip, skip + 2), ...(next ? { "@odata.nextLink": next } : {}) });
  };
  return calls;
}

const device = (id: string, serial: string | null, extra: Record<string, unknown> = {}) => ({
  "@odata.type": "#microsoft.graph.managedDevice", id, serialNumber: serial, deviceName: `DESKTOP-${id}`, manufacturer: "Dell Inc.", model: "Latitude 5440",
  operatingSystem: "Windows", osVersion: "10.0.22631.4317", imei: "", userDisplayName: "", lastSyncDateTime: "2026-09-27T08:15:00Z",
  userPrincipalName: "someone@contoso.com", emailAddress: "someone@contoso.com", ...extra,
});

const refused = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, `expected ${code}`);
};

test("connected only with the three settings, each of the right shape", () => {
  assert.equal(intune.connected({}), false);
  assert.equal(intune.connected(env), true);
  assert.equal(intune.connected({ ...env, INTUNE_TENANT_ID: "0f3a2b1c-aaaa-4bbb-8ccc-123456789abc" }), true);
  assert.equal(intune.connected({ ...env, INTUNE_TENANT_ID: "evil.com/../x" }), false);
  assert.equal(intune.connected({ ...env, INTUNE_CLIENT_ID: "not-a-guid" }), false);
  assert.equal(intune.connected({ ...env, INTUNE_CLIENT_SECRET: "" }), false);
});

test("reads every page with a client-credentials token, as Microsoft documents it; the secret goes only to Microsoft's login", async () => {
  const calls = graph([device("1", "A1"), device("2", "A2"), device("3", "A3")]);
  const devices = await intune.readDevices(env);
  assert.deepEqual(devices.map(d => d.serial), ["A1", "A2", "A3"]);
  const [login, ...pages] = calls;
  assert.equal(login!.url, "https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token");
  assert.equal(login!.method, "POST");
  const form = new URLSearchParams(login!.body);
  assert.deepEqual(Object.fromEntries(form), { client_id: env.INTUNE_CLIENT_ID, client_secret: env.INTUNE_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
  assert.equal(pages.length, 2);
  assert.equal(pages[0]!.url, "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices");
  assert.ok(pages.every(p => p.headers.get("authorization") === "Bearer eyJ.fake" && !p.url.includes("s3cret") && !JSON.stringify([...p.headers]).includes("s3cret")));
  // What the tool reads; the addresses are only to ask the Chest who it is.
  assert.deepEqual(Object.keys(devices[0]!).sort(), ["addresses", "deviceName", "id", "imei", "lastCheckIn", "manufacturer", "model", "os", "osVersion", "serial", "user"]);
  assert.deepEqual(devices[0]!.addresses, ["someone@contoso.com"]);
  assert.equal(devices[0]!.imei, null);
  // Only through the Chest's egress, only to the two declared hosts.
  assert.ok(chest.egress.length >= 3 && chest.egress.every(e => /^https:\/\/(login\.microsoftonline|graph\.microsoft)\.com\//u.test(e.url) && !e.refused));
});

test("a next page anywhere but Microsoft Graph is not followed; odd devices are skipped", async () => {
  const calls = graph([], { page: () => json({ value: [device("1", "B1"), { id: 42 }, "junk", device("2", null, { lastSyncDateTime: "0001-01-01T00:00:00Z" })], "@odata.nextLink": "https://evil.example/steal" }) });
  const devices = await intune.readDevices(env);
  assert.deepEqual(devices.map(d => d.id), ["1", "2"]);
  assert.equal(devices[1]!.lastCheckIn, null);
  assert.equal(calls.some(c => c.url.includes("evil")), false);
});

test("Microsoft's refusals and silences, each in words", async () => {
  await refused(intune.readDevices({}), "intune_not_connected");
  graph([], { token: json({ error: "invalid_client" }, 401) });
  await refused(intune.readDevices(env), "intune_denied");
  graph([], { page: () => json({ error: { code: "Forbidden" } }, 403) });
  await refused(intune.readDevices(env), "intune_denied");
  graph([], { page: () => json({ nothing: true }) });
  await refused(intune.readDevices(env), "intune_invalid");
  microsoft = async () => { throw new TypeError("fetch failed"); };
  await refused(intune.readDevices(env), "intune_unreachable");
  // Too many requests: tried again once after Retry-After, then "busy".
  let tries = 0;
  graph([device("1", "C1")], { page: () => (++tries === 1 ? json({}, 429, { "retry-after": "0" }) : null) });
  assert.equal((await intune.readDevices(env)).length, 1);
  graph([], { page: () => json({}, 429, { "retry-after": "0" }) });
  await refused(intune.readDevices(env), "intune_busy");
});

test("a read keeps each device's facts by serial number and the member its address is, never a name or an address", async () => {
  const { sql } = database;
  Object.assign(process.env, env);
  await refused(intune.refresh(sql, H), "forbidden");
  graph([
    device("1", "SER-1", { userDisplayName: "Inès Moreau", emailAddress: address(ines), userPrincipalName: address(ines) }),
    device("2", "ser-1", { userDisplayName: "Inès Moreau", emailAddress: address(ines), userPrincipalName: address(ines), lastSyncDateTime: "2026-09-01T08:00:00Z" }),
    device("3", "SER-3", { userDisplayName: "Someone Unknown", operatingSystem: "iOS", osVersion: "18.6", imei: "356938035643809", emailAddress: "someone@contoso.com", userPrincipalName: "someone@contoso.com" }),
    device("4", null),
    // Hugo's name, someone else's address: never matched by the name.
    device("5", "SER-5", { userDisplayName: "Hugo Bernard", emailAddress: "hugo.bernard@elsewhere.example", userPrincipalName: "hb@elsewhere.example" }),
    // Léa's mail address is an alias the Chest does not know; her
    // principal name is her sign-in address, in capitals.
    device("6", "SER-6", { userDisplayName: "", emailAddress: "l.dubois@contoso.com", userPrincipalName: " " + address(lea).toUpperCase() + " " }),
  ]);
  const read = await intune.refresh(sql, M);
  assert.deepEqual([read.devices, read.withoutSerial], [4, 1]);
  const rows = await sql<{ serial_key: string; member_id: string | null; last_check_in: Date }[]>`select serial_key, member_id, last_check_in from intune_devices order by serial_key`;
  assert.deepEqual(rows.map(r => [r.serial_key, r.member_id]), [["ser-1", ines.id], ["ser-3", null], ["ser-5", null], ["ser-6", lea.id]]);
  // The device enrolled twice keeps its latest check-in.
  assert.equal(rows[0]!.last_check_in.toISOString(), "2026-09-27T08:15:00.000Z");
  const stored = JSON.stringify(await sql`select * from intune_devices`);
  assert.equal(stored.includes("Inès") || stored.includes("@"), false);
  // A failed read keeps the last one and says why.
  graph([], { token: json({}, 401) });
  await refused(intune.refresh(sql, M), "intune_denied");
  assert.equal((await sql`select 1 from intune_devices`).length, 4);
  const status = await intune.status(sql, M);
  assert.equal(status.connected, true);
  assert.equal(status.last?.outcome, "denied");
  assert.ok(status.lastGood);
  await refused(intune.status(sql, H), "forbidden");
});

test("a Chest without matchEmails yet (404): the member of the same name, when exactly one has it; a Chest that does not answer keeps the last read", async () => {
  const { sql } = database;
  Object.assign(process.env, env);
  const before = await sql`select serial_key, member_id from intune_devices order by serial_key`;
  const real = globalThis.fetch;
  let answer = 404;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/members/match")) return json({ error: answer === 404 ? "not_found" : "unavailable" }, answer);
    return real(input, init);
  }) as typeof fetch;
  try {
    graph([device("1", "SER-1", { userDisplayName: "Inès Moreau", emailAddress: "nobody@elsewhere.example" }), device("3", "SER-3", { userDisplayName: "Someone Unknown" })]);
    answer = 503;
    await refused(intune.refresh(sql, M), "unavailable");
    assert.deepEqual(await sql`select serial_key, member_id from intune_devices order by serial_key`, before);
    answer = 404;
    await intune.refresh(sql, M);
    assert.deepEqual((await sql<{ serial_key: string; member_id: string | null }[]>`select serial_key, member_id from intune_devices order by serial_key`).map(r => [r.serial_key, r.member_id]), [["ser-1", ines.id], ["ser-3", null]]);
  } finally {
    globalThis.fetch = real;
  }
});

test("the overview's news: devices not here yet, and items Intune gives to someone else", async () => {
  const { sql } = database;
  const cats = await listCategories(sql, M);
  const laptop = cats.find(c => c.key === "laptop")!.id;
  const here = await items.createItem(sql, M, { categoryId: laptop, name: "Latitude", serial: " SER-1 " });
  let status = await intune.status(sql, M);
  assert.equal(status.missing, 1);
  // Intune says Inès; here it is in stock.
  assert.deepEqual(status.differ.map(d => [d.itemId, d.holder, d.intune]), [[here.id, null, ines.id]]);
  await items.give(sql, M, here.id, { to: { member: ines.id } });
  status = await intune.status(sql, M);
  assert.deepEqual(status.differ, []);
  const facts = await intune.factsOf(sql, M, "ser-1");
  assert.equal(facts?.os, "Windows");
  assert.equal(facts?.member, ines.id);
  assert.equal(await intune.factsOf(sql, M, "nothing"), null);
  await refused(intune.factsOf(sql, H, "ser-1"), "forbidden");
});

test("what Intune knows and Equipment does not goes through the importer: its preview, its people, nothing twice", async () => {
  const { sql } = database;
  const devices = [
    device("1", "SER-1", { userDisplayName: "Inès Moreau" }),
    device("5", "PHONE-5", { userDisplayName: "Hugo Bernard", operatingSystem: "Android", osVersion: "15", manufacturer: "samsung", model: "SM-S921B", imei: "356938035643817" }),
    device("6", "MAC-6", { userDisplayName: "Léa Dubois", operatingSystem: "macOS", osVersion: "15.6", manufacturer: "Apple", model: "MacBookAir10,1" }),
    device("7", "=cmd|' /C calc'!A0", { userDisplayName: "" }),
  ];
  const { text, count } = await intune.missingAsCsv(sql, M, devices.map(d => intune.readDevice(d)!));
  assert.equal(count, 3);
  assert.equal(text.includes("SER-1"), false);
  await refused(intune.missingAsCsv(sql, H, []), "forbidden");
  const plan = await previewImport(sql, M, "intune", text);
  const rows = plan.rows.filter(r => !r.skip);
  assert.deepEqual(rows.map(r => [r.name, r.holder]), [["samsung SM-S921B", hugo.id], ["Apple MacBookAir10,1", lea.id], ["Dell Inc. Latitude 5440", null]]);
  const done = await applyImport(sql, M, "intune", text);
  assert.equal(done.imported, 3);
  const phone = (await items.listItems(sql, M, { q: "PHONE-5" }))[0]!;
  assert.equal(phone.category.key, "phone");
  assert.equal(phone.holder, hugo.id);
  const fields = await allFields(sql);
  const valueOf = (i: items.Item, name: string) => i.extra[fields.find(f => f.categoryId === i.category.id && f.name === name)?.id ?? ""];
  assert.equal(valueOf(phone, "IMEI"), "356938035643817");
  const mac = (await items.listItems(sql, M, { q: "MAC-6" }))[0]!;
  assert.equal(mac.category.key, "laptop");
  assert.equal(valueOf(mac, "Operating system"), "macOS 15.6");
  // A formula in a serial number is kept as it is (the export writes it
  // behind a quote again).
  assert.equal((await items.listItems(sql, M, { q: "calc" }))[0]!.serial, "=cmd|' /C calc'!A0");
  const detail = await items.itemDetail(sql, M, phone.id);
  assert.ok(detail.full && detail.history.some(h => h.kind === "imported" && h.note === "Intune"));
  // No bell for an import.
  assert.equal(chest.notifications.some(n => n.member === hugo.id), false);
  // A device its address matched goes to that member's name today,
  // whatever name Intune gives.
  const matched = { ...intune.readDevice(device("8", "TAB-8", { userDisplayName: "Nora P." }))!, member: nora.id };
  assert.match((await intune.missingAsCsv(sql, M, [matched])).text, /TAB-8,Nora Petit,/u);
  // Again: nothing left to add.
  assert.equal((await intune.missingAsCsv(sql, M, devices.map(d => intune.readDevice(d)!))).count, 0);
});

test("an erasure forgets the member Intune named; the nightly read does nothing until connected", async () => {
  const { sql } = database;
  await erase(sql, ines.id);
  assert.deepEqual((await sql<{ member_id: string }[]>`select member_id from intune_devices where serial_key = 'ser-1'`).map(r => r.member_id), ["erased"]);
  const before = (await sql`select 1 from intune_reads`).length;
  assert.equal(await chest.run("intune", onSchedule, { scheduledAt: "2026-09-29T03:40:00Z" }), 204);
  assert.equal((await sql`select 1 from intune_reads`).length, before);
  // Connected: it reads; a refusal is kept, and the run still ends well
  // (tried again the next night, not every few minutes).
  Object.assign(process.env, env);
  graph([device("1", "SER-1", { userDisplayName: "Sofia Rossi", emailAddress: address(sofia) })]);
  assert.equal(await chest.run("intune", onSchedule, { scheduledAt: "2026-09-30T03:40:00Z" }), 204);
  assert.deepEqual((await sql<{ member_id: string }[]>`select member_id from intune_devices`).map(r => r.member_id), [sofia.id]);
  graph([], { token: json({}, 401) });
  assert.equal(await chest.run("intune", onSchedule, { scheduledAt: "2026-10-01T03:40:00Z" }), 204);
  const [last] = await sql<{ by: string; outcome: string }[]>`select by, outcome from intune_reads order by id desc limit 1`;
  assert.deepEqual([last!.by, last!.outcome], ["schedule", "denied"]);
});
