// A member's busy times as tools of one Chest tell each other (Proposal
// (studio): events between tools): "<tool>.busy", version 1. Booking and
// Hiring both speak it — Booking tells when a host is taken (bookings,
// times blocked, their Google/Outlook/Apple calendars), Hiring when
// someone is in an interview — so neither offers a time the other has
// already given away. Leave speaks it too ("leave.busy": the days someone
// is off), and both hear it. Pure: no database, no SDK.
//
// The event's data, a snapshot:
//
//   { v: 1, member: "mbr_…", at: "2026-09-29T21:04:12.345Z",
//     from: "2026-09-29T00:00Z", to: "2026-12-28T00:00Z",
//     spans: [["2026-09-30T08:00Z", "2026-09-30T09:00Z"], …] }
//
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
const minuteText = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";
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

// The snapshot's fingerprint, its time aside: the same busy times told
// twice are told once.
export const busyFingerprint = (s: BusySnapshot) => JSON.stringify([s.member, s.from, s.to, s.spans]);

// readBusy checks what another tool sent: null when it is not a version 1
// snapshot within bounds (then nothing is kept).
export function readBusy(data: unknown): { member: string; at: Date; from: Date; to: Date; spans: Span[] } | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const time = (value: unknown) => (typeof value === "string" && instantPattern.test(value) ? Date.parse(value) : NaN);
  if (d["v"] !== 1 || typeof d["member"] !== "string" || !memberPattern.test(d["member"])) return null;
  const at = time(d["at"]), from = time(d["from"]), to = time(d["to"]);
  if (!Number.isFinite(at) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > busyLimits.readDays * day) return null;
  if (!Array.isArray(d["spans"]) || d["spans"].length > busyLimits.readSpans) return null;
  const spans: Span[] = [];
  for (const pair of d["spans"] as unknown[]) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const start = time(pair[0]), end = time(pair[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < from || end > to) return null;
    spans.push({ start, end });
  }
  return { member: d["member"], at: new Date(at), from: new Date(from), to: new Date(to), spans };
}
