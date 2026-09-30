import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityNotGranted, ChestError } from "../src/errors.js";
import * as events from "../src/events.js";
import type { Member } from "../src/member.js";
import { fakeChest } from "../src/testing.js";

// Events between tools (Proposal (studio), not in 0.3.0): publish, receive,
// occurredAt, receivers. Ported from 0.3.0-studio.16's events.test.ts, whose
// official part is now 0.3.0's own.

const id = (name: string): string => "mbr_" + name + "a".repeat(26 - name.length);
const camille: Member = { id: id("camille"), firstName: "Camille", lastName: "Martin", name: "Camille Martin", photo: null, role: "editor", isAdmin: false, isBuilder: false, groups: [], language: "en", timeZone: "Europe/Paris" };

test("events between tools (proposal): a tool publishes its own events; another receives them on /chest-events", async () => {
  const chest = await fakeChest({ members: [camille], emits: ["tool.approved"], receivers: 2 });
  try {
    const sent = await events.publish("tool.approved", { member: camille.id, from: "2026-10-12", to: "2026-10-16" }, { key: "leave:42" });
    assert.equal(sent.receivers, 2);
    assert.equal((await events.publish("tool.approved", { member: camille.id, from: "2026-10-12", to: "2026-10-16" }, { key: "leave:42" })).id, sent.id);
    // studio.15: the same key for another event is refused, not answered with the first.
    await assert.rejects(events.publish("tool.approved", { member: camille.id }, { key: "leave:42" }), (e: unknown) => e instanceof ChestError && e.code === "key_conflict");
    assert.deepEqual(chest.published.map(p => p.type), ["tool.approved"]);
    await assert.rejects(events.publish("other.approved", {}), (e: unknown) => e instanceof ChestError && e.code === "invalid_event");
    await assert.rejects(events.publish("tool.unknown", {}), (e: unknown) => e instanceof ChestError && e.code === "invalid_event");
    const got: events.ToolEvent[] = [];
    const app = async (request: Request) => new Response(null, { status: await events.handle(request, {}, { tools: { "leave.approved": e => { got.push(e); } } }) });
    assert.equal(await chest.deliver({ type: "leave.approved", data: { member: camille.id, from: "2026-10-12" } }, app), 204);
    assert.equal(got[0]?.source, "leave");
    assert.equal(got[0]?.data["from"], "2026-10-12");
    // A type without a handler is accepted and ignored; a source that is not
    // the type's own is refused.
    assert.equal(await chest.deliver({ type: "crm.won", data: {} }, app), 204);
    assert.equal(await chest.deliver({ type: "leave.approved", source: "crm", data: {} }, app), 401);
  } finally {
    await chest.close();
  }
});

// Proposal (studio.16): Support and Tasks tell again every 15 minutes what
// the Chest could not take; Goals counts by when it happened, so an event
// published after its cycle ended must keep its time.
test("publish with occurredAt (studio.16): a late event keeps when it happened, within 24 hours and not ahead", async () => {
  const chest = await fakeChest({ tool: "helpdesk", members: [camille], emits: ["helpdesk.ticket.solved"], linked: { "helpdesk.ticket.solved": ["goals"] } });
  try {
    const solved = new Date(Date.now() - 20 * 60_000);
    const sent = await events.publish("helpdesk.ticket.solved", { ticket: 42, assignee: camille.id }, { key: "ticket:42:solved", occurredAt: solved });
    assert.equal(sent.receivers, 1);
    assert.equal(chest.published[0]?.occurredAt, solved.toISOString());
    // A retry with the same key and the same time is the same event; an
    // offset is the same instant.
    const offset = new Date(solved.getTime() + 2 * 3_600_000).toISOString().replace("Z", "+02:00");
    assert.equal((await events.publish("helpdesk.ticket.solved", { ticket: 42, assignee: camille.id }, { key: "ticket:42:solved", occurredAt: offset })).id, sent.id);
    // Another time under the same key is another event: refused.
    await assert.rejects(events.publish("helpdesk.ticket.solved", { ticket: 42, assignee: camille.id }, { key: "ticket:42:solved", occurredAt: new Date(solved.getTime() + 1000) }), (e: unknown) => e instanceof ChestError && e.code === "key_conflict");
    // Out of bounds, or not an instant with its zone: nothing is sent.
    const refused = (e: unknown) => e instanceof ChestError && e.code === "invalid_event";
    await assert.rejects(events.publish("helpdesk.ticket.solved", {}, { occurredAt: new Date(Date.now() - 25 * 3_600_000) }), refused);
    await assert.rejects(events.publish("helpdesk.ticket.solved", {}, { occurredAt: new Date(Date.now() + 5 * 60_000) }), refused);
    await assert.rejects(events.publish("helpdesk.ticket.solved", {}, { occurredAt: "2026-09-30T10:00:00" }), refused);
    await assert.rejects(events.publish("helpdesk.ticket.solved", {}, { occurredAt: "yesterday" }), refused);
    await assert.rejects(events.publish("helpdesk.ticket.solved", {}, { occurredAt: new Date(Number.NaN) }), refused);
    assert.equal(chest.published.length, 1);
    // Within the clock skew ahead: taken.
    await events.publish("helpdesk.ticket.solved", { ticket: 43 }, { occurredAt: new Date(Date.now() + 30_000) });
    // Without occurredAt: the time of the publish.
    const before = Date.now();
    await events.publish("helpdesk.ticket.solved", { ticket: 44 });
    assert.ok(Date.parse(chest.published[2]!.occurredAt) >= before - 1000);
    // What the receiver sees: the event's occurredAt.
    const got: events.ToolEvent[] = [];
    const app = async (request: Request) => new Response(null, { status: await events.handle(request, {}, { tools: { "helpdesk.ticket.solved": e => { got.push(e); } } }) });
    assert.equal(await chest.deliver({ type: "helpdesk.ticket.solved", data: chest.published[0]!.data, occurredAt: chest.published[0]!.occurredAt }, app), 204);
    assert.equal(got[0]?.occurredAt, solved.toISOString());
    // The check itself, against a given clock.
    const now = Date.parse("2026-09-30T12:00:00Z");
    assert.equal(events.occurredAtOf("2026-09-30T13:30:00+02:00", now), "2026-09-30T11:30:00.000Z");
    assert.equal(events.occurredAtOf("2026-09-29T12:00:00Z", now), "2026-09-29T12:00:00.000Z");
    assert.throws(() => events.occurredAtOf("2026-09-29T11:59:59Z", now), refused);
    assert.throws(() => events.occurredAtOf("2026-09-30T12:01:01Z", now), refused);
  } finally {
    await chest.close();
  }
});

// Proposal (studio.16): Forms greys "Send to Clients" when nothing will
// receive its contacts — toolUrl says only that Clients is installed.
test("receivers (studio.16): the tools linked to receive a type this tool emits", async () => {
  const chest = await fakeChest({ tool: "forms", emits: ["forms.contact", "forms.request"], linked: { "forms.contact": ["crm"] }, tools: { crm: true, helpdesk: true } });
  try {
    assert.deepEqual(await events.receivers("forms.contact"), ["crm"]);
    // Installed but not linked: nothing receives it.
    assert.deepEqual(await events.receivers("forms.request"), []);
    // The admin links Support: the answer follows, and publish counts it.
    chest.linked["forms.request"] = ["helpdesk", "crm"];
    assert.deepEqual(await events.receivers("forms.request"), ["crm", "helpdesk"]);
    assert.equal((await events.publish("forms.request", { answer: "k3" })).receivers, 2);
    // Only this tool's own, declared types.
    const refused = (e: unknown) => e instanceof ChestError && e.code === "invalid_event";
    await assert.rejects(events.receivers("crm.contact"), refused);
    await assert.rejects(events.receivers("forms.unknown"), refused);
    await assert.rejects(events.receivers("Forms"), refused);
  } finally {
    await chest.close();
  }
  // Outside a Chest, or a Chest without events between tools.
  process.env["CHEST_TOOL"] = "forms";
  delete process.env["CHEST_API"];
  try {
    await assert.rejects(events.receivers("forms.contact"), CapabilityNotGranted);
  } finally {
    delete process.env["CHEST_TOOL"];
  }
});
