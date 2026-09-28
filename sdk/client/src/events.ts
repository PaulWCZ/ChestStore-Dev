import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { ask, json as readJson, refusal } from "./api.js";
import { CapabilityNotGranted, ChestError, Unavailable } from "./errors.js";
import { memberIdPattern } from "./member.js";
import { forget } from "./members.js";

// What the Chest tells a server tool of its members' lifecycle, for a tool
// whose chest.json declares "capabilities": ["members"] and "receives":
// ["member.*"]. The Chest posts each event to the tool's POST /chest-events,
// through its launcher only (never from the Internet), signed for this tool:
//
//   // app/chest-events/route.ts (Next.js): outside /chest, never behind a session
//   import * as events from "@argentic/chest-sdk/events";
//   export async function POST(request: Request) {
//     return new Response(null, { status: await events.handle(request, {
//       "member.erased": async e => { await anonymise(e.data.id); await events.acknowledgeErasure(e.data.erasure); },
//       "access.revoked": e => unassign(e.data.id),
//     }, { seen }) });
//   }
//
// Delivery is at least once, in no guaranteed order: the same event may come
// again, always with the same id — handle() drops what the store of seen ids
// already holds. An event the tool does not answer with a success is
// delivered again, after a growing delay, for 72 hours; after that the tool
// is out of sync and reconciles by listing its members (members.list) at its
// next start. Every event also empties what members.lookup keeps.

// What changed of a member the tool sees; "email" only with members.email.
export type MemberChange = "name" | "photo" | "role" | "groups" | "email";
// Something the tool sees of a member who has it changed.
export type MemberUpdated = { id: string; type: "member.updated"; occurredAt: string; data: { id: string; changed: MemberChange[] } };
// The member lost access to the tool but stays in the Chest.
export type AccessRevoked = { id: string; type: "access.revoked"; occurredAt: string; data: { id: string } };
// The member left the Chest: members.lookup reads them "former".
export type MemberRemoved = { id: string; type: "member.removed"; occurredAt: string; data: { id: string } };
// The owner asked for this person's data to be erased: delete or anonymise
// what the tool keeps of them before deadline, then acknowledgeErasure(erasure).
export type MemberErased = { id: string; type: "member.erased"; occurredAt: string; data: { id: string; erasure: string; deadline: string } };
// An event, told apart by its type.
export type ChestEvent = MemberUpdated | AccessRevoked | MemberRemoved | MemberErased;
export type ChestEventType = ChestEvent["type"];

// What handle() calls for each type; a type left out is accepted and ignored.
export type Handlers = { [K in ChestEventType]?: (event: Extract<ChestEvent, { type: K }>) => void | Promise<void> };

// Proposal (studio) — events between tools. A tool publishes events of its
// own, named after it ("leave.approved" from the tool "leave"); a tool that
// receives them (chest.json "receives": ["leave.approved"]) gets them on the
// same POST /chest-events, signed the same way, once an admin linked the
// two tools (approved in words: "Is told by Leave when a leave is
// approved"). data is what the publisher documents (plain JSON, 16 KiB at
// most); people in it are member ids.
export type ToolEvent = { id: string; type: string; source: string; occurredAt: string; data: Record<string, unknown> };
export type ToolHandlers = Record<string, (event: ToolEvent) => void | Promise<void>>;
export const toolEventPattern = /^[a-z0-9]+(-[a-z0-9]+)*\.[a-z][a-z0-9_.-]{0,62}$/u;

// Where handle() remembers the ids of the events already handled: a store
// the tool chooses. Keep it durable — a table of the tool's database — so a
// delivery made again after a restart of the tool is recognised:
//
//   create table chest_events (id text primary key, at timestamptz not null default now());
//   const seen = {
//     has: async (id: string) => (await sql`select 1 from chest_events where id = ${id}`).length > 0,
//     add: async (id: string) => { await sql`insert into chest_events (id) values (${id}) on conflict do nothing`; },
//   };
export type Seen = { has(id: string): boolean | Promise<boolean>; add(id: string): void | Promise<void> };

// memorySeen keeps the last limit ids in this process: lost at a restart,
// enough for a tool whose handlers are idempotent anyway.
export function memorySeen(limit = 10000): Seen {
  const ids = new Set<string>();
  return {
    has: id => ids.has(id),
    add: id => {
      ids.delete(id);
      ids.add(id);
      while (ids.size > limit) ids.delete(ids.values().next().value as string);
    },
  };
}

// The key of the events is HMAC-SHA256 of this label under the text of
// CHEST_TOKEN, exactly as the Chest derives it (chest/toolfront): neither the
// token itself nor the key of the Chest-Member assertion.
const label = "Chest-Event v1";
const claims = ["aud", "iat", "exp", "jti", "digest"] as const;
// Clocks of the Chest and of the container may differ by this much, in seconds.
const skew = 5;
const maxSignature = 2048;
const maxBody = 64 << 10;
const compact = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;
const eventIdPattern = /^evt_[a-z2-7]{26}$/u;
// The grammar of an erasure's identifier, as the Chest mints it.
export const erasureIdPattern = /^era_[a-z2-7]{26}$/u;
const changes: readonly string[] = ["name", "photo", "role", "groups", "email"];

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function json(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
const instant = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));

function headerOf(request: IncomingMessage | Request): string | null {
  const headers = request.headers as Headers | IncomingMessage["headers"];
  const value = typeof (headers as Headers).get === "function" ? (headers as Headers).get("chest-event") : (headers as IncomingMessage["headers"])["chest-event"];
  return typeof value === "string" && value.length <= maxSignature ? value : null;
}

// bodyOf reads the body, 64 KiB at most; null beyond, or when it was read
// already.
async function bodyOf(request: IncomingMessage | Request): Promise<Buffer | null> {
  try {
    if (request instanceof Request) {
      if (request.bodyUsed || Number(request.headers.get("content-length") ?? "0") > maxBody) return null;
      const raw = Buffer.from(await request.arrayBuffer());
      return raw.length <= maxBody ? raw : null;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += (chunk as Buffer).length;
      if (size > maxBody) return null;
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

// envelope reads a signed delivery: the envelope when the signature, the tool,
// the time and the digest of the body hold; known says its type is one this
// SDK reads.
async function envelope(request: IncomingMessage | Request): Promise<{ event: ChestEvent; known: true } | { event: ToolEvent; known: "tool" } | { event: { id: string }; known: false } | null> {
  const token = process.env["CHEST_TOKEN"];
  const tool = process.env["CHEST_TOOL"];
  if (!token || !/^[A-Za-z0-9_-]{43,512}$/u.test(token) || !tool || request.method !== "POST") return null;
  const signature = headerOf(request);
  const parts = signature === null ? null : compact.exec(signature);
  if (!parts) return null;
  const [, encodedHeader = "", encodedPayload = "", encodedSignature = ""] = parts;
  const header = object(json(Buffer.from(encodedHeader, "base64url").toString("utf8")));
  if (!header || Object.keys(header).length !== 2 || header["alg"] !== "HS256" || header["typ"] !== "JWT") return null;
  const key = createHmac("sha256", Buffer.from(token, "utf8")).update(label).digest();
  const expected = createHmac("sha256", key).update(encodedHeader + "." + encodedPayload).digest();
  const given = Buffer.from(encodedSignature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = object(json(Buffer.from(encodedPayload, "base64url").toString("utf8")));
  if (!payload || Object.keys(payload).length !== claims.length || !claims.every(name => Object.hasOwn(payload, name))) return null;
  const { aud, iat, exp, jti, digest } = payload;
  if (aud !== tool || typeof jti !== "string" || !eventIdPattern.test(jti) || typeof digest !== "string") return null;
  if (typeof iat !== "number" || !Number.isSafeInteger(iat) || typeof exp !== "number" || !Number.isSafeInteger(exp) || exp <= iat) return null;
  const now = Math.floor(Date.now() / 1000);
  if (iat > now + skew || exp <= now - skew) return null;
  const body = await bodyOf(request);
  if (body === null) return null;
  const sum = createHash("sha256").update(body).digest();
  const told = Buffer.from(digest, "base64url");
  if (told.length !== sum.length || !timingSafeEqual(told, sum)) return null;
  const e = object(json(body.toString("utf8")));
  if (!e || e["id"] !== jti || typeof e["type"] !== "string" || !instant(e["occurredAt"])) return null;
  // An event of another tool (Proposal (studio)): its source names it.
  if (Object.keys(e).length === 5 && typeof e["source"] === "string") {
    const source = e["source"], type = e["type"], toolData = object(e["data"]);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/u.test(source) || !toolEventPattern.test(type) || !type.startsWith(source + ".") || !toolData) return null;
    return { known: "tool", event: { id: jti, type, source, occurredAt: e["occurredAt"] as string, data: toolData } };
  }
  if (Object.keys(e).length !== 4) return null;
  const data = object(e["data"]);
  if (!data || typeof data["id"] !== "string" || !memberIdPattern.test(data["id"])) return null;
  const keys = Object.keys(data).sort().join(",");
  const base = { id: jti, occurredAt: e["occurredAt"] as string };
  switch (e["type"]) {
    case "member.updated": {
      const changed = data["changed"];
      if (keys !== "changed,id" || !Array.isArray(changed) || changed.length < 1 || changed.length > changes.length || !changed.every(c => typeof c === "string" && changes.includes(c)) || new Set(changed).size !== changed.length) return null;
      return { known: true, event: { ...base, type: "member.updated", data: { id: data["id"], changed: [...changed] as MemberChange[] } } };
    }
    case "access.revoked":
    case "member.removed":
      return keys === "id" ? { known: true, event: { ...base, type: e["type"], data: { id: data["id"] } } } : null;
    case "member.erased":
      if (keys !== "deadline,erasure,id" || typeof data["erasure"] !== "string" || !erasureIdPattern.test(data["erasure"]) || !instant(data["deadline"])) return null;
      return { known: true, event: { ...base, type: "member.erased", data: { id: data["id"], erasure: data["erasure"], deadline: data["deadline"] as string } } };
  }
  // A type of a later Chest: signed, so the tool accepts it, and ignores it.
  return { known: false, event: { id: jti } };
}

// verify returns the event a delivery carries, or null when it is not one
// the Chest made for this tool — no or another signature, for another tool,
// expired, a body that is not the one signed, not a POST — or when it is of a
// type this SDK does not know. It reads the body (64 KiB at most): call it
// before anything else reads it. It never throws for what a request carries.
export async function verify(request: IncomingMessage | Request): Promise<ChestEvent | null> {
  const read = await envelope(request);
  return read?.known === true ? read.event : null;
}

const remembered = memorySeen();

// handle verifies one delivery and hands the event to its handler, once:
// the status to answer the Chest. 401 for a delivery that is not the
// Chest's; 204 for an event handled, one already seen (seen.has), a type
// without a handler or one this SDK does not know. A handler that throws
// leaves the event unseen and handle throws: answer 500, the Chest delivers
// it again. seen is the store of the ids handled (memorySeen by default,
// lost at a restart: give a durable one).
export async function handle(request: IncomingMessage | Request, handlers: Handlers, options: { seen?: Seen; tools?: ToolHandlers } = {}): Promise<number> {
  const read = await envelope(request);
  if (!read) return 401;
  if (read.known === false) return 204;
  const seen = options.seen ?? remembered;
  const event = read.event;
  if (await seen.has(event.id)) return 204;
  if (read.known === "tool") {
    const handler = options.tools && Object.hasOwn(options.tools, read.event.type) ? options.tools[read.event.type] : undefined;
    if (handler) await handler(read.event);
  } else {
    // A member changed or left: what lookup kept of them is stale.
    forget();
    const handler = handlers[read.event.type] as ((e: ChestEvent) => void | Promise<void>) | undefined;
    if (handler) await handler(read.event);
  }
  await seen.add(event.id);
  return 204;
}

// publish tells the tools that receive it that something happened here
// (Proposal (studio)): type is "<this tool>.<name>" as chest.json "emits"
// declares it; data a JSON object of 16 KiB at most (member ids for
// people). key makes a retry harmless: the same key within 24 hours is one
// event. Says the event's id and how many tools it goes to (the Chest
// delivers, at least once, like member events). Errors: ChestError
// invalid_event (400: a type this tool does not emit, data too large),
// CapabilityNotGranted (not declared, or a Chest without events between
// tools yet), QuotaExceeded (1,000 events an hour), Unavailable.
export async function publish(type: string, data: Record<string, unknown>, options: { key?: string } = {}): Promise<{ id: string; receivers: number }> {
  const tool = process.env["CHEST_TOOL"] ?? "";
  if (!toolEventPattern.test(type) || !type.startsWith(tool + ".")) throw new ChestError("invalid_event", 400, `an event of this tool is named "${tool}.<name>"`);
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new ChestError("invalid_event", 400, "data is a JSON object");
  const body = JSON.stringify({ type, data, ...(options.key !== undefined ? { key: options.key } : {}) });
  if (Buffer.byteLength(body) > 16 << 10) throw new ChestError("invalid_event", 400, "data is 16 KiB at most");
  if (options.key !== undefined && !/^[A-Za-z0-9._:-]{1,64}$/u.test(options.key)) throw new ChestError("invalid_event", 400, "invalid key");
  const response = await ask("events", "POST", "/events", { body, type: "application/json" });
  if (response.status === 404) {
    await response.body?.cancel();
    throw new CapabilityNotGranted("events");
  }
  if (response.status !== 200 && response.status !== 201) throw await refusal(response, "events");
  const answer = (await readJson(response)) as { id?: unknown; receivers?: unknown } | null;
  if (!answer || typeof answer.id !== "string" || !/^evt_[a-z2-7]{26}$/u.test(answer.id) || typeof answer.receivers !== "number") throw new Unavailable();
  return { id: answer.id, receivers: answer.receivers };
}

// acknowledgeErasure tells the Chest the tool deleted or anonymised what it
// kept of the person of that erasure (member.erased): the owner sees it done.
// Acknowledging again is harmless. Errors: ChestError erasure_not_found
// (404, an erasure this tool was not told of), invalid_id (400),
// CapabilityNotGranted (403: the version does not receive member events),
// Unavailable.
export async function acknowledgeErasure(erasure: string): Promise<void> {
  if (typeof erasure !== "string" || !erasureIdPattern.test(erasure)) throw new ChestError("invalid_id", 400, "invalid erasure identifier");
  const response = await ask("events", "POST", `/erasures/${erasure}/done`);
  if (response.status === 204) return;
  if (response.status < 400) {
    await response.body?.cancel();
    throw new Unavailable();
  }
  throw await refusal(response, "events");
}
