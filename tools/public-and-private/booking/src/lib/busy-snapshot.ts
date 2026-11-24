// A member's busy times as tools of one Chest tell each other (SDK 0.7.0
// events between tools): "<tool>.busy", version 1. Booking and
// Hiring both speak it — Booking tells when a host is taken (bookings,
// times blocked, their Google/Outlook/Apple calendars), Hiring when
// someone is in an interview — so neither offers a time the other has
// already given away. Leave speaks it too ("leave.busy": the days someone
// is off), and both hear it. Pure: no database, no SDK.
//
// The event's data, a snapshot (chest.json "emits": v number, member
// member, at, from and to time, spans text — an event's fields are flat, so
// the list of spans is its JSON, a text):
//
//   { v: 1, member: "mbr_…", at: "2026-09-29T21:04:12.345Z",
//     from: "2026-09-29T00:00:00Z", to: "2026-12-28T00:00:00Z",
//     spans: "[[\"2026-09-30T08:00:00Z\",\"2026-09-30T09:00:00Z\"],…]" }
//
// 300 spans at most: about 15 KB, within the Chest's 16 KiB of data.
// - Only times: never who, what, where. A span is busy from its start to
//   its end (minutes, UTC), sorted, never overlapping.
// - A snapshot replaces everything the receiver holds from that tool for
//   that member between from and to; after to, nothing is known.
// - at orders snapshots: delivery is at least once, in no set order, so a
//   receiver keeps a snapshot only when it is newer than the one it has.
// - A tool tells only its own busy times, never what another tool told it
//   (no echo, no loop).

export const busyLimits = { days: 90, spans: 300, readSpans: 1000, readDays: 400 } as const;
export type Span = { start: number; end: number };
export type BusySnapshot = { v: 1; member: string; at: string; from: string; to: string; spans: [string, string][] };

const day = 86_400_000;
// An instant on the minute, RFC 3339 with its seconds (the "time" kind of
// an event's field): "2026-09-30T08:00:00Z".
const minuteText = (ms: number) => new Date(ms).toISOString().slice(0, 16) + ":00Z";
const memberPattern = /^mbr_[a-z2-7]{26}$/u;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/u;

// busySnapshot: a member's spans from the start of today (UTC) to
// busyLimits.days later, on the minute (widened, never narrowed), merged.
// Past busyLimits.spans spans, the snapshot stops where the first one left
// out starts: it never claims a time free that it does not know.
export function busySnapshot(member: string, spans: Span[], now: number): BusySnapshot {
  const from = Math.floor(now / day) * day;
  let to = from + busyLimits.days * day;
  const sorted = spans
    .filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.end > from && s.start < to)
    .map(s => ({ start: Math.floor(Math.max(s.start, from) / 60_000) * 60_000, end: Math.ceil(Math.min(s.end, to) / 60_000) * 60_000 }))
    .sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const s of sorted) {
    const last = merged.at(-1);
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  if (merged.length > busyLimits.spans) {
    to = merged[busyLimits.spans]!.start;
    merged.length = busyLimits.spans;
  }
  return { v: 1, member, at: new Date(now).toISOString(), from: minuteText(from), to: minuteText(to), spans: merged.map(s => [minuteText(s.start), minuteText(s.end)]) };
}

// busyData: the snapshot as the event carries it (spans as JSON text).
export const busyData = (s: BusySnapshot): Record<string, unknown> => ({ ...s, spans: JSON.stringify(s.spans) });

// The snapshot's fingerprint, its time aside: the same busy times told
// twice are told once.
export const busyFingerprint = (s: BusySnapshot) => JSON.stringify([s.member, s.from, s.to, s.spans]);

// readBusy checks what another tool sent: null when it is not a version 1
// (or unversioned) snapshot within bounds (then nothing is kept). Spans come as JSON text
// (the flat schema of SDK 0.7.0) or, from a teller of before, as a list.
export function readBusy(data: unknown): { at: Date; member: string; from: Date; to: Date; spans: Span[] } | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const time = (value: unknown) => (typeof value === "string" && instantPattern.test(value) ? Date.parse(value) : NaN);
  // Version 1, or no version at all: 0.7.0's data carries only the fields a
  // teller declares, and Hiring's hiring.busy declares none (member, at,
  // from, to, spans). Another version is another shape: ignored.
  if ((d["v"] !== undefined && d["v"] !== 1) || typeof d["member"] !== "string" || !memberPattern.test(d["member"])) return null;
  const at = time(d["at"]), from = time(d["from"]), to = time(d["to"]);
  if (!Number.isFinite(at) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > busyLimits.readDays * day) return null;
  const list = typeof d["spans"] === "string" ? parseList(d["spans"]) : d["spans"];
  if (!Array.isArray(list) || list.length > busyLimits.readSpans) return null;
  const spans: Span[] = [];
  for (const pair of list as unknown[]) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const start = time(pair[0]), end = time(pair[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < from || end > to) return null;
    spans.push({ start, end });
  }
  return { at: new Date(at), member: d["member"], from: new Date(from), to: new Date(to), spans };
}

// parseList reads spans told as JSON text; null when it is not JSON (64 KiB
// at most: more than any snapshot within bounds).
function parseList(text: string): unknown {
  if (text.length > 65536) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
