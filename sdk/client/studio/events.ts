import type { IncomingMessage } from "node:http";
import { ask, json as readJson, refusal } from "../src/api.js";
import { CapabilityNotGranted, ChestError, Unavailable } from "../src/errors.js";
import { handle as officialHandle, type Handlers } from "../src/events.js";
import { groupIdPattern } from "../src/member.js";
import { forget } from "../src/members.js";
import { delivery, eventChannel, headerValue, instant, json, memorySeen, object, type Seen } from "../src/signed.js";
import { idempotencyKey } from "./keys.js";

// @argentic/chest-sdk/events as the studio publishes it: 0.4.1's module —
// verify, acknowledgeErasure, memorySeen, every type, the same values — with
// the studio's proposals: events between tools (publish, receivers, and
// handle's tools), and the Chest's group events (group.changed,
// group.removed) for a tool that reads its groups. handle is the one name
// the studio defines again: it hands a member event to 0.4.1's handle,
// unchanged, and the studio's events to their handlers.
export * from "../src/events.js";

// ---- The Chest's groups (Studio proposal) ---------------------------------------
//
// For a tool that holds "groups": "read" and receives "group.*"
// (chest.proposals.json): a group was renamed or changed members (who is in
// it; member.updated with "groups" also comes for each member concerned who
// has the tool), or was deleted — withdraw what targeted it.
export type GroupChange = "name" | "members";
export type GroupChanged = { id: string; type: "group.changed"; occurredAt: string; data: { id: string; changed: GroupChange[] } };
export type GroupRemoved = { id: string; type: "group.removed"; occurredAt: string; data: { id: string } };
export type GroupEvent = GroupChanged | GroupRemoved;
// 0.4.1's handlers of member events, and those of group events.
export type StudioHandlers = Handlers & {
  "group.changed"?: (event: GroupChanged) => void | Promise<void>;
  "group.removed"?: (event: GroupRemoved) => void | Promise<void>;
};

// ---- Events between tools (Studio proposal) --------------------------------------
//
// A tool publishes events of its own, named after it ("leave.approved" from
// the tool "leave"); a tool that receives them ("receives":
// ["leave.approved"] in chest.proposals.json — 0.4's chest.json takes
// "member.*" only) gets them on the same POST /chest-events, signed the
// same way (Chest-Event), once an admin linked the two tools (approved in
// words: "Is told by Leave when a leave is approved"). data is what the
// publisher documents (plain JSON, 16 KiB at most); people in it are member
// ids. occurredAt is when it happened: the time the publisher gave
// (publish's occurredAt, studio.16 — an event told late by a retry keeps
// its time), or the Chest's time of the publish.
export type ToolEvent = { id: string; type: string; source: string; occurredAt: string; data: Record<string, unknown> };
export type ToolHandlers = Record<string, (event: ToolEvent) => void | Promise<void>>;
export const toolEventPattern = /^[a-z][a-z0-9-]{0,47}\.[a-z][a-z0-9_.-]{0,62}$/u;
const toolPattern = /^[a-z][a-z0-9-]{0,47}$/u;

// What a delivery on /chest-events is, read once: an event of another tool,
// an event of the Chest's groups, or anything else (a member event, an
// event of a later Chest), which 0.4.1's handle reads.
type Read = { kind: "tool"; event: ToolEvent } | { kind: "group"; event: GroupEvent } | { kind: "official"; signature: string; body: Buffer };

async function read(request: IncomingMessage | Request): Promise<Read | null> {
  const signature = headerValue(request, "chest-event", 2048);
  const signed = await delivery(request, eventChannel);
  if (!signed || signature === null) return null;
  const { id, body } = signed;
  const e = object(json(body.toString("utf8")));
  if (!e || e["id"] !== id || typeof e["type"] !== "string" || !instant(e["occurredAt"])) return null;
  const type = e["type"], occurredAt = e["occurredAt"];
  // An event of another tool: its source names it.
  if (Object.keys(e).length === 5 && typeof e["source"] === "string") {
    const source = e["source"], data = object(e["data"]);
    if (!toolPattern.test(source) || !toolEventPattern.test(type) || !type.startsWith(source + ".") || !data) return null;
    return { kind: "tool", event: { id, type, source, occurredAt, data } };
  }
  if (Object.keys(e).length === 4 && (type === "group.changed" || type === "group.removed")) {
    const data = object(e["data"]);
    if (!data || typeof data["id"] !== "string" || !groupIdPattern.test(data["id"])) return null;
    const keys = Object.keys(data).sort().join(",");
    if (type === "group.removed") return keys === "id" ? { kind: "group", event: { id, type, occurredAt, data: { id: data["id"] } } } : null;
    const changed = data["changed"];
    if (keys !== "changed,id" || !Array.isArray(changed) || changed.length < 1 || changed.length > 2 || !changed.every(c => c === "name" || c === "members") || new Set(changed).size !== changed.length) return null;
    return { kind: "group", event: { id, type, occurredAt, data: { id: data["id"], changed: [...changed] as GroupChange[] } } };
  }
  return { kind: "official", signature, body };
}

const remembered = memorySeen();

// handle verifies one delivery on /chest-events and hands it to its
// handler, once. A member event — or one this SDK does not know — goes to
// 0.4.1's events.handle, unchanged (its 204, 401, seen and lookup's
// forgetting); an event of another tool to tools[type], one of the Chest's
// groups to handlers["group.changed" | "group.removed"] (and what lookup
// kept is forgotten, as for a member event). A type without a handler is
// accepted and ignored. 401 for a delivery that is not the Chest's. A
// handler that throws leaves the event unseen and handle throws: answer
// 500, the Chest delivers it again. seen is the store of the ids handled
// (memorySeen by default: give a durable one, the same as for 0.4.1's
// events and schedules).
export async function handle(request: IncomingMessage | Request, handlers: StudioHandlers, options: { seen?: Seen; tools?: ToolHandlers } = {}): Promise<number> {
  const got = await read(request);
  if (!got) return 401;
  const seen = options.seen ?? remembered;
  if (got.kind === "official") {
    // The body is read: 0.4.1's handle receives the same delivery again,
    // its signature and body as they came.
    const again = new Request("http://tool.invalid/chest-events", { method: "POST", headers: { "Content-Type": "application/json", "Chest-Event": got.signature }, body: new Uint8Array(got.body) });
    return officialHandle(again, handlers, { seen });
  }
  if (await seen.has(got.event.id)) return 204;
  if (got.kind === "tool") {
    const handler = options.tools && Object.hasOwn(options.tools, got.event.type) ? options.tools[got.event.type] : undefined;
    if (handler) await handler(got.event);
  } else {
    forget();
    const event = got.event;
    if (event.type === "group.changed") await handlers["group.changed"]?.(event);
    else await handlers["group.removed"]?.(event);
  }
  await seen.add(got.event.id);
  return 204;
}

// publish tells the tools that receive it that something happened here:
// type is "<this tool>.<name>" as chest.proposals.json "emits" declares it;
// data a JSON object of 16 KiB at most (member ids for people). key makes a
// retry harmless: the same key within 24 hours is one event — any text of 1
// to 512 characters without control characters, never cut (a long one goes
// as its SHA-256, as mail's; studio.15); the same key with another type,
// other data or another occurredAt is refused (ChestError key_conflict,
// 409), never answered with the first event.
//
// occurredAt (studio.16) is when it happened, when the tool publishes later
// than that — a retry after the Chest was unreachable, a schedule that tells
// what waited: a Date or an ISO 8601 instant with Z or an offset, within the
// last 24 hours (the window in which the key makes a retry one event) and
// not ahead of now beyond a minute of clock skew. Receivers read it as the
// event's occurredAt; without it, the Chest's time of the publish. Store it
// with what waits to be published, and give the same one at every attempt.
//
// Says the event's id and how many tools it goes to (the Chest delivers,
// at least once, like member events). Errors: ChestError invalid_event
// (400: a type this tool does not emit, data too large, occurredAt out of
// bounds), CapabilityNotGranted (not declared, or a Chest without events
// between tools yet), QuotaExceeded (1,000 events an hour), Unavailable.
export async function publish(type: string, data: Record<string, unknown>, options: { key?: string; occurredAt?: Date | string } = {}): Promise<{ id: string; receivers: number }> {
  const tool = process.env["CHEST_TOOL"] ?? "";
  if (!toolEventPattern.test(type) || !type.startsWith(tool + ".")) throw new ChestError("invalid_event", 400, `an event of this tool is named "${tool}.<name>"`);
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new ChestError("invalid_event", 400, "data is a JSON object");
  const key = options.key === undefined ? undefined : idempotencyKey(options.key);
  if (key === null) throw new ChestError("invalid_event", 400, "a key is 1 to 512 characters, without control characters");
  const occurred = options.occurredAt === undefined ? undefined : occurredAtOf(options.occurredAt);
  const body = JSON.stringify({ type, data, ...(key !== undefined ? { key } : {}), ...(occurred !== undefined ? { occurred_at: occurred } : {}) });
  if (Buffer.byteLength(body) > 16 << 10) throw new ChestError("invalid_event", 400, "data is 16 KiB at most");
  const response = await ask("events", "POST", "/events", { body, type: "application/json" });
  if (response.status === 404) {
    await response.body?.cancel();
    throw new CapabilityNotGranted("events");
  }
  if (response.status !== 200 && response.status !== 201) throw await refusal(response, "events");
  const answer = (await readJson(response)) as { id?: unknown; receivers?: unknown } | null;
  if (!answer || typeof answer.id !== "string" || !eventChannel.id.test(answer.id) || typeof answer.receivers !== "number") throw new Unavailable();
  return { id: answer.id, receivers: answer.receivers };
}

// How far back and ahead an event's occurredAt may be (studio.16): 24 hours
// back — the window of a key, so an event told late is still one event —
// and a minute ahead, for the clocks of the tool's container and of the
// Chest.
export const occurredLimits = { behindMs: 86_400_000, aheadMs: 60_000 } as const;

// occurredAtOf reads an occurredAt as the Chest keeps it (ISO 8601 in UTC,
// milliseconds), or throws invalid_event: not an instant with its zone,
// older than 24 hours, or ahead of now beyond a minute. now is the clock
// it is measured against (the Chest checks again against its own).
export function occurredAtOf(value: Date | string, now: number = Date.now()): string {
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/u.test(value)) throw new ChestError("invalid_event", 400, "occurredAt is a Date or an ISO 8601 instant with Z or an offset");
  const at = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(at)) throw new ChestError("invalid_event", 400, "occurredAt is a Date or an ISO 8601 instant with Z or an offset");
  if (at < now - occurredLimits.behindMs) throw new ChestError("invalid_event", 400, "occurredAt is within the last 24 hours");
  if (at > now + occurredLimits.aheadMs) throw new ChestError("invalid_event", 400, "occurredAt is not in the future");
  return new Date(at).toISOString();
}

// receivers says which tools receive an event this tool emits (studio.16):
// the names (chest.json "name") of the installed tools that declare it in
// "receives" AND that an admin linked to this tool for it — what publish
// would deliver to now, sorted; [] when none. For a page that offers a
// link to another tool ("Send contacts to Clients"): greyed with its reason
// when Clients is not among them, which chest.tools.get — that only says a
// tool is installed — cannot tell. It reads the Chest's current links: call
// it when rendering such a page, not at every publish. Errors: ChestError
// invalid_event (a type this tool does not emit), CapabilityNotGranted (not
// declared, or a Chest without events between tools), Unavailable.
export async function receivers(type: string): Promise<string[]> {
  const tool = process.env["CHEST_TOOL"] ?? "";
  if (typeof type !== "string" || !toolEventPattern.test(type) || !type.startsWith(tool + ".")) throw new ChestError("invalid_event", 400, `an event of this tool is named "${tool}.<name>"`);
  const response = await ask("events", "GET", "/events/receivers?type=" + encodeURIComponent(type));
  if (response.status === 404) {
    await response.body?.cancel();
    throw new CapabilityNotGranted("events");
  }
  if (response.status !== 200) throw await refusal(response, "events");
  const answer = (await readJson(response)) as { tools?: unknown } | null;
  const tools = answer?.tools;
  if (!Array.isArray(tools) || tools.length > 1000 || !tools.every(t => typeof t === "string" && toolPattern.test(t))) throw new Unavailable();
  return [...new Set(tools as string[])].sort();
}
