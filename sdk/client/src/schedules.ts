import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

// Proposal (studio) — scheduled tasks: work a tool does by itself, at set
// times, without anyone opening it (reminders, a morning digest, purges, a
// badge kept true overnight). The Chest runs nothing inside the tool's
// container; it calls the tool, as it delivers events:
//
//   // chest.json — each entry is a permission the owner approves:
//   // “Runs by itself on a schedule: morning (weekdays at 07:30)”
//   "schedules": [{ "name": "morning", "cron": "30 7 * * 1-5" }]
//
//   // app/chest-jobs/[name]/route.ts (Next.js): outside /chest, never behind a session
//   import * as schedules from "@argentic/chest-sdk/schedules";
//   export async function POST(request: Request) {
//     return new Response(null, { status: await schedules.handle(request, {
//       morning: async run => { await remindDueToday(run.scheduledAt); },
//     }) });
//   }
//
// At each time the cron line gives, in the Chest's time zone, the Chest
// posts to the tool's POST /chest-jobs/<name> through its launcher (never
// from the Internet), signed for this tool (Chest-Job, like Chest-Event). A
// run is delivered at least once: a handler that throws (500) is delivered
// again, after 1, 5 and 15 minutes, then given up and shown to the builders
// as failed. Runs of one schedule never overlap: while one is in flight,
// the next time is skipped (and logged). A node that was down runs a missed
// time once when it comes back, never a backlog. The Chest keeps each run's
// start, duration and answer in the tool's journal and shows the next run.
//
// Bounds (the Chest's): 8 schedules per tool, at most every 15 minutes, 5
// minutes per run (the request's own limit); 1 run in flight per schedule.

export type Run = {
  // "run_…": the same on every delivery of this run.
  id: string;
  name: string;
  // The time the cron line gave for this run (ISO 8601, UTC).
  scheduledAt: string;
  // 1 for the first delivery, 2 to 4 for the next ones.
  attempt: number;
  // The Chest's time zone (IANA), in which the cron line is read.
  timeZone: string;
};
export type ScheduleHandlers = Record<string, (run: Run) => void | Promise<void>>;
export type Schedule = { name: string; cron: string };

const label = "Chest-Job v1";
const claims = ["aud", "iat", "exp", "jti", "digest"] as const;
const skew = 5;
const maxSignature = 2048;
const maxBody = 4096;
const compact = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;
export const runIdPattern = /^run_[a-z2-7]{26}$/u;
export const schedulePattern = /^[a-z][a-z0-9-]{0,31}$/u;
export const limits = { schedules: 8, minimumMinutes: 15, attempts: 4 } as const;

// timeZone is the Chest's time zone (chest.timeZone(), kept here for the
// tools that import it from schedules).
import { timeZone } from "./chest.js";
export { timeZone };

// ---- Cron lines: minute hour day-of-month month day-of-week ----------------

type Field = { values: Set<number>; any: boolean };
const ranges: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function field(text: string, index: number): Field | null {
  const [min, max] = ranges[index]!;
  const values = new Set<number>();
  for (const part of text.split(",")) {
    const m = /^(\*|(\d{1,2})(?:-(\d{1,2}))?)(?:\/(\d{1,2}))?$/u.exec(part);
    if (!m) return null;
    const step = m[4] === undefined ? 1 : Number(m[4]);
    const from = m[1] === "*" ? min : Number(m[2]);
    const to = m[1] === "*" ? max : m[3] === undefined ? (m[4] === undefined ? from : max) : Number(m[3]);
    if (step < 1 || from < min || to > max || from > to) return null;
    for (let v = from; v <= to; v += step) values.add(index === 4 && v === 7 ? 0 : v);
  }
  return { values, any: text === "*" };
}

// parseCron reads a five-field cron line (numbers, "*", ranges, lists and
// steps; Sunday is 0 or 7); null when it is not one.
export function parseCron(line: string): Field[] | null {
  if (typeof line !== "string" || line.length > 100) return null;
  const parts = line.trim().split(/\s+/u);
  if (parts.length !== 5) return null;
  const fields = parts.map((p, i) => field(p, i));
  return fields.every((f): f is Field => f !== null) ? fields : null;
}

// The wall-clock parts of an instant in a time zone.
function wall(date: Date, zone: string): { minute: number; hour: number; day: number; month: number; weekday: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", minute: "numeric", hour: "numeric", day: "numeric", month: "numeric", weekday: "short" }).formatToParts(date).map(p => [p.type, p.value]));
  return { minute: Number(parts["minute"]), hour: Number(parts["hour"]), day: Number(parts["day"]), month: Number(parts["month"]), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts["weekday"] ?? "") };
}

function matches(fields: Field[], w: ReturnType<typeof wall>): boolean {
  const [minute, hour, dom, month, dow] = fields as [Field, Field, Field, Field, Field];
  if (!minute.values.has(w.minute) || !hour.values.has(w.hour) || !month.values.has(w.month)) return false;
  // As cron does: when both days are restricted, either one matches.
  if (!dom.any && !dow.any) return dom.values.has(w.day) || dow.values.has(w.weekday);
  return dom.values.has(w.day) && dow.values.has(w.weekday);
}

// nextRun is the first time after `after` that the cron line gives, read in
// the time zone; null when there is none in the next 400 days.
export function nextRun(line: string, after: Date = new Date(), zone: string = timeZone()): Date | null {
  const fields = parseCron(line);
  if (!fields) return null;
  let t = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  const end = t + 400 * 86400000;
  while (t < end) {
    const w = wall(new Date(t), zone);
    // Skip whole hours and days that cannot match, to stay quick.
    if (!fields[3]!.values.has(w.month) || !fields[1]!.values.has(w.hour)) {
      t += 3600000 - w.minute * 60000;
      continue;
    }
    if (matches(fields, w)) return new Date(t);
    t += 60000;
  }
  return null;
}

// shortestGap is the fewest minutes between two runs, over a week read in
// UTC.
function shortestGap(fields: Field[]): number {
  let last = -Infinity, gap = Infinity;
  const start = Date.UTC(2026, 0, 4);
  for (let minute = 0; minute < 7 * 1440; minute++) {
    const d = new Date(start + minute * 60000);
    const w = { minute: d.getUTCMinutes(), hour: d.getUTCHours(), day: d.getUTCDate(), month: d.getUTCMonth() + 1, weekday: d.getUTCDay() };
    if (!matches(fields, w)) continue;
    gap = Math.min(gap, minute - last);
    last = minute;
  }
  return gap;
}

// checkSchedules says what is wrong with a manifest's "schedules" (the
// Chest's rules), empty when nothing: the entry, its name, its cron line,
// how often it runs.
export function checkSchedules(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > limits.schedules) return [`schedules is 1 to ${limits.schedules} entries`];
  const problems: string[] = [];
  const names = new Set<string>();
  for (const entry of value) {
    const e = entry !== null && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : null;
    if (!e || Object.keys(e).some(k => k !== "name" && k !== "cron")) {
      problems.push('a schedule is {"name", "cron"}');
      continue;
    }
    const name = e["name"], cron = e["cron"];
    if (typeof name !== "string" || !schedulePattern.test(name)) problems.push(`schedule name ${JSON.stringify(name)}: lowercase letters, digits and hyphens, 32 at most`);
    else if (names.has(name)) problems.push(`schedule ${name} twice`);
    else names.add(name);
    const fields = typeof cron === "string" ? parseCron(cron) : null;
    if (!fields) problems.push(`schedule ${String(name)}: ${JSON.stringify(cron)} is not a five-field cron line`);
    else if (shortestGap(fields) < limits.minimumMinutes) problems.push(`schedule ${String(name)} runs more often than every ${limits.minimumMinutes} minutes`);
  }
  return problems;
}

// describeCron says a cron line in plain words, for the owner's approval and
// a tool's settings: "weekdays at 07:30", "every day at 06:00", "every hour
// at :15"; the line itself when it is not one of these shapes.
export function describeCron(line: string): string {
  const fields = parseCron(line);
  if (!fields) return line;
  const [m, h, dom, mon, dow] = line.trim().split(/\s+/u);
  const at = (hh: string, mm: string) => `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
  if (/^\d+$/u.test(m!) && /^\d+$/u.test(h!) && dom === "*" && mon === "*") {
    if (dow === "*") return `every day at ${at(h!, m!)}`;
    if (dow === "1-5") return `weekdays at ${at(h!, m!)}`;
    if (/^[0-7]$/u.test(dow!)) return `${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][Number(dow)]} at ${at(h!, m!)}`;
  }
  if (/^\d+$/u.test(m!) && h === "*" && dom === "*" && mon === "*" && dow === "*") return `every hour at :${m!.padStart(2, "0")}`;
  return line;
}

// ---- Deliveries ------------------------------------------------------------

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

function headerOf(request: IncomingMessage | Request): string | null {
  const headers = request.headers as Headers | IncomingMessage["headers"];
  const value = typeof (headers as Headers).get === "function" ? (headers as Headers).get("chest-job") : (headers as IncomingMessage["headers"])["chest-job"];
  return typeof value === "string" && value.length <= maxSignature ? value : null;
}
function pathOf(request: IncomingMessage | Request): string {
  try {
    return new URL(request.url ?? "/", "http://tool").pathname;
  } catch {
    return "";
  }
}
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

// verify returns the run a delivery carries, or null when it is not one the
// Chest made for this tool: no or another signature, another tool, expired,
// a body other than the one signed, a path that is not
// /chest-jobs/<its name>, not a POST. It reads the body. It never throws
// for what a request carries.
export async function verify(request: IncomingMessage | Request): Promise<Run | null> {
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
  if (aud !== tool || typeof jti !== "string" || !runIdPattern.test(jti) || typeof digest !== "string") return null;
  if (typeof iat !== "number" || !Number.isSafeInteger(iat) || typeof exp !== "number" || !Number.isSafeInteger(exp) || exp <= iat) return null;
  const now = Math.floor(Date.now() / 1000);
  if (iat > now + skew || exp <= now - skew) return null;
  const body = await bodyOf(request);
  if (body === null) return null;
  const sum = createHash("sha256").update(body).digest();
  const told = Buffer.from(digest, "base64url");
  if (told.length !== sum.length || !timingSafeEqual(told, sum)) return null;
  const r = object(json(body.toString("utf8")));
  if (!r || Object.keys(r).sort().join(",") !== "attempt,id,name,scheduledAt,timeZone" || r["id"] !== jti) return null;
  const { name, scheduledAt, attempt, timeZone: zone } = r;
  if (typeof name !== "string" || !schedulePattern.test(name) || pathOf(request) !== "/chest-jobs/" + name) return null;
  if (typeof scheduledAt !== "string" || scheduledAt.length > 40 || Number.isNaN(Date.parse(scheduledAt))) return null;
  if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 1 || attempt > limits.attempts || typeof zone !== "string" || zone.length > 64) return null;
  return { id: jti, name, scheduledAt, attempt, timeZone: zone };
}

// handle verifies one delivery and runs the handler of its schedule: the
// status to answer the Chest. 401 for a delivery that is not the Chest's,
// 404 for a schedule without a handler, 204 once the handler returned. A
// handler that throws makes handle throw: answer 500, the Chest delivers
// the run again (run.attempt counts). Handlers must be idempotent: a run may
// come twice (the same run.id).
export async function handle(request: IncomingMessage | Request, handlers: ScheduleHandlers): Promise<number> {
  const run = await verify(request);
  if (!run) return 401;
  const handler = Object.hasOwn(handlers, run.name) ? handlers[run.name] : undefined;
  if (!handler) return 404;
  await handler(run);
  return 204;
}
