import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import * as officialChestModule from "../../src/chest.js";
import * as officialEvents from "../../src/events.js";
import * as officialFiles from "../../src/files.js";
import * as officialMember from "../../src/member.js";
import * as officialMembers from "../../src/members.js";
import * as officialTesting from "../../src/testing.js";
import * as schedules from "../../src/schedules.js";
import * as sealed from "../../src/sealed.js";
import * as folders from "../../src/folders.js";
import * as notifications from "../../src/notifications.js";
import * as realtime from "../../src/realtime.js";
import { connect } from "../../src/realtime-client.js";
import type { Member } from "../../src/member.js";
import * as checks from "../checks.js";
import * as chestModule from "../chest.js";
import * as files from "../files.js";
import * as member from "../member.js";
import * as members from "../members.js";
import * as root from "../index.js";
import * as officialRoot from "../../index.js";
import { RateLimited } from "../../src/errors.js";
import * as testing from "../testing.js";
import { fakeChest, withMember } from "../testing.js";

// How the studio's modules sit on 0.7.0's: every official name is the
// official value — the studio redefines none of 0.7.0's functions but chest
// (an object of 0.7.0's getters and the studio's members) and testing's
// fakeChest, signAssertion and withMember (0.7.0's inside) — and the fake
// Chest passes what is 0.7.0's to 0.7.0's fake: files, groups, notices,
// events, sealed values, folders, realtime.

const camille: Member = { id: "mbr_" + "camille".padEnd(26, "a"), firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "hr", isAdmin: false, isBuilder: false, groups: [], language: "fr", timeZone: "Europe/Paris" };

test("every name of 0.7.0's modules is, through the studio's, the very same value", () => {
  const pairs: [string, Record<string, unknown>, Record<string, unknown>, string[]][] = [
    ["member", officialMember, member, []],
    ["files", officialFiles, files, []],
    ["members", officialMembers, members, []],
    ["chest", officialChestModule, chestModule, ["chest"]],
    ["testing", officialTesting, testing, ["fakeChest", "signAssertion", "withMember"]],
  ];
  for (const [name, official, studio, redefined] of pairs) {
    for (const [key, value] of Object.entries(official)) {
      if (redefined.includes(key)) continue;
      assert.equal(studio[key], value, `${name}.${key}`);
    }
    assert.deepEqual(Object.keys(studio).filter(k => k in official).sort(), Object.keys(official).sort(), `every name of 0.7.0's ${name} is there`);
  }
  // The root: 0.7.0's, the namespaces of the extended modules the studio's.
  for (const [key, value] of Object.entries(officialRoot)) {
    if (["files", "members", "chest"].includes(key)) continue;
    assert.equal((root as Record<string, unknown>)[key], value, `root ${key}`);
  }
  for (const gone of ["broadcast", "publish", "receivers", "claim", "publicUploadUrl", "shownTo", "maxAssertionLength"]) {
    for (const mod of [files, members, member, testing, root] as Record<string, unknown>[]) assert.equal(gone in mod, false, `${gone} went`);
  }
});

test("0.7.0's events go through the studio's fake: a member event and another tool's, each handled once", async () => {
  const chest = await fakeChest({ members: [camille], receives: ["member.*", "quote.accepted"] });
  const seen = officialEvents.memorySeen();
  const told: string[] = [];
  const handlers: officialEvents.Handlers<"access.revoked" | "quote.accepted"> = {
    "access.revoked": e => void told.push(e.data.id),
    "quote.accepted": e => void told.push(`${e.source}:${String(e.data["quote"])}:${JSON.stringify(e.audience)}`),
  };
  const server = createServer((request, response) => {
    void officialEvents.handle(request, handlers, { seen }).then(status => response.writeHead(status).end());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const web = (request: Request) => officialEvents.handle(request, handlers, { seen }).then(status => new Response(null, { status }));
    const id = "evt_" + "a".repeat(26);
    assert.equal(await chest.deliver({ type: "access.revoked", data: { id: camille.id }, id }, web), 204);
    assert.equal(await chest.deliver({ type: "access.revoked", data: { id: camille.id }, id }, web), 204, "again: seen");
    const node = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    assert.equal(await chest.deliver({ type: "quote.accepted", source: "quotes", audience: [camille.id], data: { quote: "q-1" } }, node), 204);
    assert.deepEqual(told, [camille.id, `quotes:q-1:["${camille.id}"]`]);
    const run = await chest.run("morning", request => officialEvents.handle(request, handlers).then(status => new Response(null, { status })));
    assert.equal(run, 401, "a run is not an event");
  } finally {
    server.close();
    await chest.close();
  }
});

test("0.7.0's emits, notices, sealed values and folders answer through the studio's fake", async () => {
  const chest = await fakeChest({
    tool: "people", members: [camille], roles: ["hr", "member"],
    capabilities: ["members", "notifications", "sealed", "folders"],
    emits: { "people.leaving": { description: "Someone is leaving", data: { member: "member", last: "date" } } },
    folders: { given: [{ name: "Contracts", members: { [camille.id]: "edit" }, files: { "Offer.pdf": "%PDF-1.4 offer" } }] },
  });
  try {
    const sent = await officialEvents.emit("people.leaving", { member: camille.id, last: "2026-12-31" }, { subject: camille.id, key: "leaving:1" });
    assert.equal(sent.receivers, 0);
    assert.deepEqual(chest.emitted.map(e => e.type), ["people.leaving"]);
    await assert.rejects(officialEvents.emit("people.leaving_cancelled", {}), (e: unknown) => (e as { code?: string }).code === "invalid_type", "an underscore is no type of 0.7");
    await notifications.notify([camille.id], { title: "Welcome", translations: { fr: { title: "Bienvenue" } } });
    await notifications.broadcast({ title: "Party" , translations: { fr: { title: "Fête" } } });
    assert.deepEqual(chest.notifications.map(n => n.title), ["Bienvenue", "Fête"], "each in the member's language");
    const iban = await sealed.seal("FR76 3000 6000 0112 3456 7890 189", { context: "employee:1", roles: ["hr"] });
    const request = withMember(new Request("http://people.test/chest"), camille);
    assert.equal(await sealed.open(request, iban, { context: "employee:1" }), "FR76 3000 6000 0112 3456 7890 189");
    const given = await folders.list(request);
    assert.deepEqual(given.map(f => f.name), ["Contracts"]);
    const page = await folders.files(request, given[0]!.id);
    const { url } = await folders.url(request, page.files[0]!.id);
    assert.ok(url.startsWith(chest.api), "a document's link on the fake's address, the studio's server");
    assert.equal(await (await fetch(url)).text(), "%PDF-1.4 offer");
  } finally {
    await chest.close();
  }
});

test("0.7.0's files: a member's and a visitor's uploads through the studio's fake", async () => {
  const chest = await fakeChest({ capabilities: ["files"] });
  try {
    const up = await files.uploadUrl("cv/", { public: true, types: ["application/pdf"] });
    assert.match(up.url, /^\/_chest\/files\/upload\//u, "a path, sent to the page's own address");
    const answer = await chest.upload(up.url, "%PDF-1.4 cv", "application/pdf");
    assert.equal(answer.status, 201);
    const { name } = await answer.json() as { name: string };
    assert.ok(await files.stat(name));
    const mine = await files.uploadUrl("notes/a.txt", { types: ["text/plain"] });
    assert.equal((await chest.upload(mine.url, "hello", "text/plain")).status, 201);
    assert.equal((await files.get("notes/a.txt"))?.size, 5);
  } finally {
    await chest.close();
  }
});

test("0.7.0's realtime goes through the studio's fake: a page connects, a commit reaches it", async () => {
  const chest = await fakeChest({
    members: [camille], capabilities: ["realtime"],
    realtime: { channels: [{ name: "everyone", presence: true }], feeds: [{ table: "notes", channel: "everyone", columns: ["id", "text"] }] },
  });
  try {
    assert.ok(chest.realtime.url(camille.id).startsWith(chest.api.replace(/^http/u, "ws")), "the page connects to the studio's server");
    const live = connect({ url: chest.realtime.url(camille.id) });
    const room = live.channel("everyone");
    const joined = new Promise<void>(resolve => room.onJoined(() => resolve()));
    const row = new Promise<unknown>(resolve => room.on("notes.insert", payload => resolve(payload)));
    await joined;
    chest.realtime.commit("notes", "insert", { id: 1, text: "Hello" });
    assert.deepEqual(await row, { id: 1, text: "Hello" });
    const published = await realtime.publish("everyone", "notes.changed", { id: 1 });
    assert.ok(published.seq >= 1);
    live.close();
  } finally {
    await chest.close();
  }
});

test("0.7.0's schedules run through the studio's fake: run() posts /chest-schedules, signed Chest-Schedule", async () => {
  const chest = await fakeChest({ tool: "tasks" });
  try {
    const runs: schedules.Run[] = [];
    const to = (request: Request) => schedules.handle(request, { morning: run => void runs.push(run) }).then(status => new Response(null, { status }));
    assert.equal(await chest.run("morning", to, { scheduledAt: "2026-10-05T05:30:00.000Z" }), 204);
    assert.equal(await chest.run("evening", to), 404, "no handler: 0.7.0's 404");
    assert.deepEqual(runs.map(r => [r.name, r.scheduledAt, r.attempt]), [["morning", "2026-10-05T05:30:00.000Z", 1]]);
  } finally {
    await chest.close();
  }
});

test("the studio's deliveries are 0.7.0's signed deliveries on channels of their own, handled once (seen)", async () => {
  const chest = await fakeChest({ members: [camille], checks: { max: 2 } });
  try {
    await checks.configure([{ name: "website", url: "https://atelier.example/", every: 5 }]);
    const got: string[] = [];
    const to = (request: Request) => checks.handle(request, result => void got.push(result.id)).then(status => new Response(null, { status }));
    const id = "chk_" + "b".repeat(26);
    assert.equal(await chest.check("website", to, { id }), 204);
    assert.equal(await chest.check("website", to, { id }), 204);
    assert.deepEqual(got, [id], "the same result once");
    // A check's delivery is no event, and no event is a check's.
    assert.equal(await chest.check("website", (request: Request) => officialEvents.handle(request, {}).then(status => new Response(null, { status }))), 401);
    assert.equal(await chest.deliver({ type: "access.revoked", data: { id: camille.id } }, to), 401);
  } finally {
    await chest.close();
  }
});

test("the members API's 600 calls a minute are one budget for 0.7.0's routes and the studio's", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["members"] });
  try {
    for (let i = 0; i < 300; i++) await members.matchEmails(["nobody@example.com"]);
    for (let i = 0; i < 300; i++) await members.list();
    await assert.rejects(members.list(), RateLimited);
    await assert.rejects(members.matchEmails(["x@example.com"]), RateLimited);
  } finally {
    await chest.close();
  }
});
