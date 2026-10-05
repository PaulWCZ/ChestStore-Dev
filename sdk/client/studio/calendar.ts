import { ask, json, refusal } from "../src/api.js";
import { CapabilityNotGranted, ChestError, Unavailable } from "../src/errors.js";

// Studio proposal (not in 0.4.1) — the calendar bridge. Tools put events about members
// (a room booked, a desk day, an approved leave, a meeting a guest booked,
// an interview, a company event, a task due) and the Chest serves each
// member ONE secret calendar feed (iCalendar, RFC 5545) that merges every
// tool's events. The member adds its address once to Google Calendar,
// Outlook or Apple Calendar ("Add your Chest calendar", a page of the
// Chest); the tool never serves a feed, never sees the address, and a
// private tool — which has no host reachable without signing in — needs no
// public part for it.
//
//   // chest.proposals.json (a 0.4 Chest refuses keys it does not know in
//   // chest.json) — a permission:
//   //   “Adds events to the calendar of the members concerned”
//   "calendar": true
//
//   import * as calendar from "@argentic/chest-sdk/calendar";
//   await calendar.put({
//     key: "booking:981", members: [host, ...guests],
//     title: { en: "Room booked: Green room", fr: "Salle réservée : Salle verte" },
//     start: "2026-10-12T09:00:00+02:00", end: "2026-10-12T10:00:00+02:00",
//     location: "Green room, 2nd floor", path: "/chest/bookings/981",
//   });
//   await calendar.put({ key: "leave:42", members: [who], title: { en: "Off", fr: "Absent" }, days: { first: "2026-10-12", last: "2026-10-16" }, private: true });
//   await calendar.remove("booking:981");          // cancelled: gone from every feed
//
// Idempotent by key: putting the same key again replaces the event (its
// members too) and the calendars show the change at their next refresh.
// Titles are given per language (or one text for all): the Chest writes
// each member's feed in that member's language, English then the first
// given as fallbacks — one put for a meeting of people who read different
// languages. A member sees an event only while they have the tool; a
// member who leaves the Chest loses their feed.
//
// The Chest's bounds: 5,000 events kept per tool, 1,000 members an event,
// events that end at most a year ago and start at most two years ahead
// (the Chest forgets an event a year after its end), 600 writes a minute.
// A member's feed holds their 2,000 events nearest to today across tools.
// Errors: ChestError invalid_event, invalid_key (400, before anything is
// sent), CapabilityNotGranted (not declared, or a Chest without the
// calendar yet), QuotaExceeded (5,000 events), RateLimited, Unavailable.

import { memberIdPattern } from "../src/member.js";
import { check, keyPattern, limits, type CalendarEvent, type KeptEvent, type Put, type PutRefusal, type PutResult } from "./calendar-rules.js";

// What a tool uses of the rules and the writer (the rest — the checks of an
// event, the feed — is the Chest's, in calendar-rules.ts, for the fake).
export { ics, keyPattern, limits, pick, uidOf } from "./calendar-rules.js";
export type { CalendarEvent, IcsEvent, KeptEvent, Put, PutRefusal, PutResult, When, Words } from "./calendar-rules.js";

const refusals: readonly PutRefusal[] = ["invalid_event", "invalid_key", "invalid_id", "duplicate_key", "quota_exceeded"];
function invalid(message: string): ChestError {
  return new ChestError("invalid_event", 400, message);
}
function checkKey(key: unknown): string {
  if (typeof key !== "string" || !keyPattern.test(key)) throw new ChestError("invalid_key", 400, "a key is 1 to 64 of A-Z a-z 0-9 . _ : -");
  return key;
}

// put adds the event to the feeds of its members, or replaces the event of
// the same key (its members too: someone left out no longer sees it).
export async function put(event: CalendarEvent): Promise<Put> {
  const body = check(event);
  const { key, ...rest } = body as { key: string };
  const response = await ask("calendar", "PUT", "/calendar/events/" + encodeURIComponent(key), { body: JSON.stringify(rest), type: "application/json" });
  if (response.status === 404) {
    await response.body?.cancel();
    throw new CapabilityNotGranted("calendar");
  }
  if (response.status !== 200 && response.status !== 201) throw await refusal(response, "calendar");
  const answer = (await json(response)) as { members?: unknown; skipped?: unknown } | null;
  const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every(id => typeof id === "string" && memberIdPattern.test(id));
  if (!answer || !ids(answer.members) || !ids(answer.skipped)) throw new Unavailable();
  return { key, members: answer.members, skipped: answer.skipped };
}

// putMany puts many events (Proposal (0.3.0-studio.15); per event since
// 0.3.0-studio.16): a first sync — every open task with a due date, every
// approved leave — is one call per 100 events, not one per event against
// the 600 writes a minute. The answer is one PutResult per event, in the
// order given: ok (put: its members and those skipped) or not, with the
// reason — an event the SDK or the Chest refuses (invalid_event,
// invalid_key, invalid_id), a key given twice in the call (duplicate_key:
// neither is put, as the SDK cannot tell which one the tool meant), or a
// new key beyond the tool's 5,000 events (quota_exceeded: those that fit
// are put, in order). One wrong event never holds the others back; nothing
// is sent for an event the SDK refuses. What still throws is about the
// call, not an event: CapabilityNotGranted, RateLimited (a batch is one
// write of the minute), Unavailable, and an argument that is not an array.
// Beyond 100 the SDK sends batches one after the other, so an error after
// the first leaves the earlier batches applied — put again: it is
// idempotent by key.
//
// No all-or-nothing mode: no tool needs one (Rooms, Clients and Tasks all
// put what they can and retry the rest), and one that wants it checks
// every event with check() before calling.
export async function putMany(events: CalendarEvent[]): Promise<PutResult[]> {
  if (!Array.isArray(events)) throw invalid("events is an array");
  const now = new Date();
  const out: (PutResult | undefined)[] = new Array(events.length);
  const valid: { index: number; body: Record<string, unknown> }[] = [];
  const count = new Map<string, number>();
  const keyOf = (e: unknown): string => (e !== null && typeof e === "object" && typeof (e as { key?: unknown }).key === "string" ? (e as { key: string }).key : "");
  for (const e of events) count.set(keyOf(e), (count.get(keyOf(e)) ?? 0) + 1);
  events.forEach((e, index) => {
    const key = keyOf(e);
    try {
      const body = check(e, now);
      if ((count.get(key) ?? 0) > 1) out[index] = { ok: false, index, key, reason: "duplicate_key", message: `the key ${key} is given more than once` };
      else valid.push({ index, body });
    } catch (error) {
      const code = error instanceof ChestError ? error.code : "invalid_event";
      out[index] = { ok: false, index, key, reason: refusals.includes(code as PutRefusal) ? code as PutRefusal : "invalid_event", message: error instanceof Error ? error.message : "invalid event" };
    }
  });
  const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every(id => typeof id === "string" && memberIdPattern.test(id));
  for (let i = 0; i < valid.length; i += limits.perBatch) {
    const batch = valid.slice(i, i + limits.perBatch);
    const response = await ask("calendar", "PUT", "/calendar/events", { body: JSON.stringify({ events: batch.map(b => b.body) }), type: "application/json" });
    if (response.status === 404) {
      await response.body?.cancel();
      throw new CapabilityNotGranted("calendar");
    }
    if (response.status !== 200) throw await refusal(response, "calendar");
    const answer = (await json(response)) as { results?: unknown } | null;
    const results = answer && Array.isArray(answer.results) ? answer.results as { key?: unknown; members?: unknown; skipped?: unknown; error?: unknown; message?: unknown }[] : null;
    if (!results || results.length !== batch.length) throw new Unavailable();
    results.forEach((r, n) => {
      const { index, body } = batch[n]!;
      const key = body["key"] as string;
      if (!r || r.key !== key) throw new Unavailable();
      if (r.error !== undefined) {
        if (typeof r.error !== "string" || !/^[a-z_]{1,40}$/u.test(r.error)) throw new Unavailable();
        // A reason of a later Chest reads as invalid_event: not put.
        const reason = refusals.includes(r.error as PutRefusal) ? r.error as PutRefusal : "invalid_event";
        out[index] = { ok: false, index, key, reason, message: typeof r.message === "string" ? r.message.slice(0, 200) : `the Chest refused: ${r.error}` };
        return;
      }
      if (!ids(r.members) || !ids(r.skipped)) throw new Unavailable();
      out[index] = { ok: true, index, key, members: r.members, skipped: r.skipped };
    });
  }
  return out as PutResult[];
}

// remove takes the event of that key out of every feed; true when there
// was one. Removing again is harmless.
export async function remove(key: string): Promise<boolean> {
  checkKey(key);
  const response = await ask("calendar", "DELETE", "/calendar/events/" + encodeURIComponent(key));
  if (response.status === 204) return true;
  if (response.status === 404) {
    const code = ((await json(response).catch(() => null)) as { error?: unknown } | null)?.error;
    if (code === "event_not_found") return false;
    throw new CapabilityNotGranted("calendar");
  }
  throw await refusal(response, "calendar");
}

// list reads back what the tool put, by key, limit at a time (100 by
// default, 500 at most): to reconcile after a failure, or to check.
export async function list(options: { after?: string; limit?: number } = {}): Promise<{ events: KeptEvent[]; next: string | null }> {
  const query = new URLSearchParams();
  if (options.after !== undefined) query.set("after", checkKey(options.after));
  if (options.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500) throw new ChestError("invalid_query", 400, "limit is 1 to 500");
    query.set("limit", String(options.limit));
  }
  const response = await ask("calendar", "GET", "/calendar/events" + (query.size ? "?" + query.toString() : ""));
  if (response.status === 404) {
    await response.body?.cancel();
    throw new CapabilityNotGranted("calendar");
  }
  if (response.status !== 200) throw await refusal(response, "calendar");
  const answer = (await json(response)) as { events?: unknown; next?: unknown } | null;
  if (!answer || !Array.isArray(answer.events) || !(answer.next === null || (typeof answer.next === "string" && keyPattern.test(answer.next)))) throw new Unavailable();
  for (const e of answer.events as Record<string, unknown>[]) {
    if (!e || typeof e["key"] !== "string" || !keyPattern.test(e["key"]) || !Array.isArray(e["members"]) || typeof e["updated"] !== "string" || typeof e["sequence"] !== "number") throw new Unavailable();
  }
  return { events: answer.events as KeptEvent[], next: answer.next };
}

