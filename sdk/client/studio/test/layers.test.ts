import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import * as officialEvents from "../../src/events.js";
import * as officialFiles from "../../src/files.js";
import * as officialMembers from "../../src/members.js";
import * as officialNotifications from "../../src/notifications.js";
import * as schedules from "../../src/schedules.js";
import type { Member } from "../../src/member.js";
import * as checks from "../checks.js";
import * as events from "../events.js";
import * as files from "../files.js";
import * as members from "../members.js";
import { RateLimited } from "../../src/errors.js";
import * as notifications from "../notifications.js";
import { fakeChest } from "../testing.js";

// How the studio's modules sit on 0.4.1's: every official name is the
// official value, and what the studio defines again (events.handle,
// members.groups, notifications.notify) hands 0.4.1's part to 0.4.1's code.

const camille: Member = { id: "mbr_" + "camille".padEnd(26, "a"), firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: null, isAdmin: false, isBuilder: false, groups: [], language: "fr", timeZone: "Europe/Paris" };

test("every name of 0.4.1's modules is, through the studio's, the very same value", () => {
  const pairs: [string, Record<string, unknown>, Record<string, unknown>, string[]][] = [
    ["files", officialFiles, files, []],
    ["members", officialMembers, members, ["groups"]],
    ["notifications", officialNotifications, notifications, ["notify"]],
    ["events", officialEvents, events, ["handle"]],
  ];
  for (const [name, official, studio, redefined] of pairs) {
    for (const [key, value] of Object.entries(official)) {
      if (redefined.includes(key)) continue;
      assert.equal(studio[key], value, `${name}.${key}`);
    }
  }
  assert.equal(members.groups.list, officialMembers.groups.list, "members.groups.list is 0.4.1's");
});

test("events.handle hands a member event to 0.4.1's handle: its status, its seen, from a Web or a Node request", async () => {
  const chest = await fakeChest({ members: [camille] });
  const seen = officialEvents.memorySeen();
  const told: string[] = [];
  const handlers = { "access.revoked": (e: officialEvents.AccessRevoked) => void told.push(e.data.id) };
  const server = createServer((request, response) => {
    void events.handle(request, handlers, { seen }).then(status => response.writeHead(status).end());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const web = (request: Request) => events.handle(request, handlers, { seen }).then(status => new Response(null, { status }));
    const id = "evt_" + "a".repeat(26);
    assert.equal(await chest.emit({ type: "access.revoked", data: { id: camille.id }, id }, web), 204);
    assert.equal(await chest.emit({ type: "access.revoked", data: { id: camille.id }, id }, web), 204, "again: seen");
    assert.deepEqual(told, [camille.id]);
    const node = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    assert.equal(await chest.emit({ type: "access.revoked", data: { id: camille.id } }, node), 204);
    assert.deepEqual(told, [camille.id, camille.id]);
    // Unsigned, or signed for another channel: 401, as 0.4.1 answers.
    assert.equal(await events.handle(new Request("http://tool.test/chest-events", { method: "POST", body: "{}" }), handlers), 401);
    const run = await chest.run("morning", request => events.handle(request, handlers).then(status => new Response(null, { status })));
    assert.equal(run, 401, "a run is not an event");
  } finally {
    server.close();
    await chest.close();
  }
});

test("0.4.1's schedules run through the studio's fake: run() posts /chest-schedules, signed Chest-Schedule", async () => {
  const chest = await fakeChest({ tool: "tasks" });
  try {
    const runs: schedules.Run[] = [];
    const to = (request: Request) => schedules.handle(request, { morning: run => void runs.push(run) }).then(status => new Response(null, { status }));
    assert.equal(await chest.run("morning", to, { scheduledAt: "2026-10-05T05:30:00.000Z" }), 204);
    assert.equal(await chest.run("evening", to), 404, "no handler: 0.4.1's 404");
    assert.deepEqual(runs.map(r => [r.name, r.scheduledAt, r.attempt]), [["morning", "2026-10-05T05:30:00.000Z", 1]]);
  } finally {
    await chest.close();
  }
});

test("the studio's deliveries are 0.4.1's signed deliveries on channels of their own, handled once (seen)", async () => {
  const chest = await fakeChest({ checks: { max: 2 } });
  try {
    await checks.configure([{ name: "website", url: "https://atelier.example/", every: 5 }]);
    const got: string[] = [];
    const to = (request: Request) => checks.handle(request, result => void got.push(result.id)).then(status => new Response(null, { status }));
    const id = "chk_" + "b".repeat(26);
    assert.equal(await chest.check("website", to, { id }), 204);
    assert.equal(await chest.check("website", to, { id }), 204);
    assert.deepEqual(got, [id], "the same result once");
    // A check's delivery is no event, and no event is a check's.
    assert.equal(await chest.check("website", (request: Request) => events.handle(request, {}).then(status => new Response(null, { status }))), 401);
    assert.equal(await chest.emit({ type: "access.revoked", data: { id: camille.id } }, to), 401);
  } finally {
    await chest.close();
  }
});

test("the members API's 600 calls a minute are one budget for 0.4.1's routes and the studio's", async () => {
  const chest = await fakeChest({ members: [camille], capabilities: ["members", "members.groups"] });
  try {
    for (let i = 0; i < 300; i++) await members.groups.all();
    for (let i = 0; i < 300; i++) await members.list();
    await assert.rejects(members.list(), RateLimited);
    await assert.rejects(members.groups.all(), RateLimited);
  } finally {
    await chest.close();
  }
});
