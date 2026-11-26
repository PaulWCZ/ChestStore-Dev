import { addDays, instantOf, isZone, weekdayOf } from "./zone.ts";
import { windowsZone } from "./windows-zones.ts";

// Reading a calendar (RFC 5545) for its busy times only: the host's Google,
// Outlook or Apple calendar, from its secret iCal address. What comes out
// is a list of instants [start, end) — never a title, a place or a person:
// Booking needs to know when the host is busy, not why.
//
// What it reads: VEVENT with DTSTART and DTEND or DURATION, whole days
// (VALUE=DATE, in the host's time zone), times in UTC, with a TZID (IANA,
// the Windows names Outlook writes, or the calendar's own VTIMEZONE), or
// floating (the host's zone); RRULE (DAILY, WEEKLY, MONTHLY, YEARLY with
// INTERVAL, COUNT, UNTIL, BYDAY with ordinals, BYMONTHDAY, BYMONTH,
// BYSETPOS, WKST), RDATE, EXDATE, RECURRENCE-ID (a moved or cancelled
// occurrence), STATUS:CANCELLED and TRANSP:TRANSPARENT (shown as free: not
// busy). Our own code, written from the RFC; pure and tested.

export type Span = { start: number; end: number };
export type Reading = { spans: Span[]; events: number };
export class NotACalendar extends Error {
  constructor() {
    super("not_calendar");
    this.name = "NotACalendar";
  }
}

export const icalLimits = { lines: 400_000, events: 20_000, spans: 5_000, iterations: 100_000 } as const;

type Property = { name: string; params: Record<string, string>; value: string };
type Component = { kind: string; props: Property[]; children: Component[] };

// unfold joins folded lines (a line break followed by a space or a tab).
function lines(text: string): string[] {
  return text.replace(/\r\n?/gu, "\n").replace(/\n[ \t]/gu, "").split("\n");
}

// property reads "NAME;PARAM=value;PARAM="quoted:value":VALUE".
function property(line: string): Property | null {
  let i = 0;
  let quoted = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts: string[] = [];
  let current = "";
  quoted = false;
  for (const c of head) {
    if (c === '"') quoted = !quoted;
    if (c === ";" && !quoted) {
      parts.push(current);
      current = "";
    } else current += c;
  }
  parts.push(current);
  const name = (parts.shift() ?? "").toUpperCase();
  if (!/^[A-Z0-9-]+$/u.test(name)) return null;
  const params: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/gu, "");
  }
  return { name, params, value };
}

function parse(text: string): Component {
  const all = lines(text);
  if (all.length > icalLimits.lines) throw new NotACalendar();
  const root: Component = { kind: "ROOT", props: [], children: [] };
  const stack = [root];
  for (const raw of all) {
    if (raw.trim() === "") continue;
    const p = property(raw);
    if (!p) continue;
    const top = stack[stack.length - 1]!;
    if (p.name === "BEGIN") {
      const child: Component = { kind: p.value.trim().toUpperCase(), props: [], children: [] };
      top.children.push(child);
      stack.push(child);
      if (stack.length > 8) throw new NotACalendar();
    } else if (p.name === "END") {
      if (stack.length > 1) stack.pop();
    } else top.props.push(p);
  }
  const calendar = root.children.find(c => c.kind === "VCALENDAR");
  if (!calendar) throw new NotACalendar();
  return calendar;
}

const prop = (c: Component, name: string) => c.props.find(p => p.name === name);
const props = (c: Component, name: string) => c.props.filter(p => p.name === name);

// ——— Local times and zones ———

// A wall-clock time: a date and minutes after midnight (seconds dropped).
type Local = { date: string; minutes: number };
// A zone turns a wall-clock time into an instant.
type Zone = (local: Local) => number;
type Stamp = { local: Local; allDay: boolean; utc: boolean; zone: Zone };

function readStamp(value: string): { local: Local; allDay: boolean; utc: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/u.exec(value.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (Number.isNaN(Date.parse(date + "T00:00:00Z"))) return null;
  if (m[4] === undefined) return { local: { date, minutes: 0 }, allDay: true, utc: false };
  const hours = Number(m[4]), minutes = Number(m[5]);
  if (hours > 24 || minutes > 59) return null;
  return { local: { date, minutes: hours * 60 + minutes }, allDay: false, utc: m[7] === "Z" };
}

const utcZone: Zone = l => Date.parse(l.date + "T00:00:00Z") + l.minutes * 60000;
const ianaZone = (name: string): Zone => l => instantOf(l.date, l.minutes, name).getTime();

// A VTIMEZONE the calendar defines itself (Outlook, for zones it names its
// own way): each observance (STANDARD, DAYLIGHT) starts at its onsets, with
// its offset from UTC.
function definedZone(vtimezone: Component): Zone | null {
  type Observance = { onset: Local; rule: Rule | null; dates: Local[]; to: number; from: number };
  const observances: Observance[] = [];
  for (const o of vtimezone.children.filter(c => c.kind === "STANDARD" || c.kind === "DAYLIGHT")) {
    const start = prop(o, "DTSTART");
    const to = offsetOf(prop(o, "TZOFFSETTO")?.value ?? "");
    const from = offsetOf(prop(o, "TZOFFSETFROM")?.value ?? "") ?? to;
    const onset = start ? readStamp(start.value) : null;
    if (!onset || to === null || from === null) continue;
    const ruleText = prop(o, "RRULE")?.value;
    const dates = props(o, "RDATE").flatMap(p => p.value.split(",")).map(v => readStamp(v)?.local).filter((x): x is Local => !!x);
    observances.push({ onset: onset.local, rule: ruleText ? readRule(ruleText) : null, dates, to, from });
  }
  if (observances.length === 0) return null;
  return l => {
    // The latest onset at or before this wall-clock time wins.
    const year = Number(l.date.slice(0, 4));
    let best: { at: number; to: number } | null = null;
    const target = localMs(l);
    for (const o of observances) {
      const onsets = [o.onset, ...o.dates, ...(o.rule ? expandLocal(o.onset, o.rule, { from: `${year - 1}-01-01`, to: `${year}-12-31`, zone: l2 => localMs(l2) - o.from * 60000 }) : [])];
      for (const on of onsets) {
        const at = localMs(on);
        if (at <= target && (!best || at > best.at)) best = { at, to: o.to };
      }
    }
    const offset = best ? best.to : observances[0]!.to;
    return target - offset * 60000;
  };
}

function offsetOf(value: string): number | null {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/u.exec(value.trim());
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

const localMs = (l: Local) => Date.parse(l.date + "T00:00:00Z") + l.minutes * 60000;

const known = (zone: string): boolean => isZone(zone);

// zoneNamed finds the zone of a TZID: an IANA name (also inside a longer
// path, "/mozilla.org/20050126_1/Europe/Paris"), a Windows name ("Romance
// Standard Time"), the calendar's own VTIMEZONE, else the host's zone.
function zoneNamed(tzid: string | undefined, defined: Map<string, Zone>, fallback: Zone): Zone {
  if (!tzid) return fallback;
  const name = tzid.trim();
  if (known(name)) return ianaZone(name);
  const tail = name.split("/").slice(-2).join("/");
  if (tail.includes("/") && known(tail)) return ianaZone(tail);
  const windows = windowsZone(name);
  if (windows) return ianaZone(windows);
  return defined.get(name) ?? fallback;
}

// ——— Recurrence rules ———

type Weekday = { day: number; n: number };
type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  until: string | null;
  byDay: Weekday[];
  byMonthDay: number[];
  byMonth: number[];
  bySetPos: number[];
  weekStart: number;
};
const dayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function readRule(text: string): Rule | null {
  const parts = Object.fromEntries(text.split(";").map(p => {
    const eq = p.indexOf("=");
    return [p.slice(0, eq).trim().toUpperCase(), p.slice(eq + 1).trim().toUpperCase()];
  }));
  const freq = parts["FREQ"];
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;
  // Rules by the year's days or weeks, hours or minutes: not in calendars
  // people use; read as the first occurrence only.
  if (parts["BYYEARDAY"] || parts["BYWEEKNO"] || parts["BYHOUR"] || parts["BYMINUTE"] || parts["BYSECOND"]) return null;
  const ints = (v: string | undefined) => (v ? v.split(",").map(Number).filter(n => Number.isInteger(n) && n !== 0) : []);
  const byDay: Weekday[] = [];
  for (const d of (parts["BYDAY"] ?? "").split(",").filter(Boolean)) {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/u.exec(d);
    if (m) byDay.push({ day: dayCodes.indexOf(m[2]!), n: m[1] ? Number(m[1]) : 0 });
  }
  const interval = Math.max(1, Math.min(1000, Number(parts["INTERVAL"] ?? 1) || 1));
  const count = parts["COUNT"] !== undefined ? Math.max(0, Math.min(10000, Number(parts["COUNT"]) || 0)) : null;
  return {
    freq,
    interval,
    count,
    until: parts["UNTIL"] ?? null,
    byDay,
    byMonthDay: ints(parts["BYMONTHDAY"]).filter(n => n >= -31 && n <= 31),
    byMonth: ints(parts["BYMONTH"]).filter(n => n >= 1 && n <= 12),
    bySetPos: ints(parts["BYSETPOS"]),
    weekStart: Math.max(0, dayCodes.indexOf(parts["WKST"] ?? "MO")),
  };
}

const ymd = (date: string) => date.split("-").map(Number) as [number, number, number];
const dateOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const monthLength = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// The days of one month that a MONTHLY (or YEARLY, per month) rule gives.
function daysOfMonth(y: number, m: number, rule: Rule, startDay: number): string[] {
  const length = monthLength(y, m);
  let days: number[];
  if (rule.byMonthDay.length > 0) {
    days = rule.byMonthDay.map(n => (n > 0 ? n : length + 1 + n)).filter(n => n >= 1 && n <= length);
  } else if (rule.byDay.length === 0) {
    days = startDay <= length ? [startDay] : [];
  } else days = Array.from({ length }, (_, i) => i + 1);
  if (rule.byDay.length > 0) {
    days = days.filter(d => {
      const weekday = weekdayOf(dateOf(y, m, d));
      return rule.byDay.some(w => {
        if (w.day !== weekday) return false;
        if (w.n === 0) return true;
        const nth = w.n > 0 ? Math.floor((d - 1) / 7) + 1 : -(Math.floor((length - d) / 7) + 1);
        return nth === w.n;
      });
    });
  }
  return [...new Set(days)].sort((a, b) => a - b).map(d => dateOf(y, m, d));
}

function setPos<T>(list: T[], positions: number[]): T[] {
  if (positions.length === 0) return list;
  return positions.map(p => (p > 0 ? list[p - 1] : list[list.length + p])).filter((x): x is T => x !== undefined);
}

// expandLocal lists the wall-clock starts of a rule from its first start,
// up to the window's last day (the first start included, as RFC 5545
// counts it). Every period is walked from the start (COUNT needs it),
// within a fixed number of steps.
function expandLocal(start: Local, rule: Rule, window: { from: string; to: string; zone: Zone }): Local[] {
  const found: Local[] = [];
  const untilStamp = rule.until ? readStamp(rule.until) : null;
  const untilMs = untilStamp ? (untilStamp.utc ? utcZone(untilStamp.local) : null) : null;
  const untilLocal = untilStamp && !untilStamp.utc ? localMs(untilStamp.local) + (rule.until!.length === 8 ? 86400000 - 1 : 0) : null;
  const past = (l: Local) => (untilMs !== null ? window.zone(l) > untilMs : untilLocal !== null ? localMs(l) > untilLocal : false);
  let counted = 0;
  const take = (date: string): boolean => {
    // false: stop (count or until reached, or past the window).
    if (date < start.date) return true;
    const l = { date, minutes: start.minutes };
    if (past(l)) return false;
    counted++;
    if (rule.count !== null && counted > rule.count) return false;
    if (date > window.to) return false;
    if (date >= window.from) found.push(l);
    return true;
  };
  const [y0, m0, d0] = ymd(start.date);
  let steps = 0;
  const limit = icalLimits.iterations;
  if (rule.freq === "DAILY") {
    for (let date = start.date; steps++ < limit; date = addDays(date, rule.interval)) {
      const [y, m, d] = ymd(date);
      if (rule.byMonth.length > 0 && !rule.byMonth.includes(m)) { if (date > window.to) break; continue; }
      if (rule.byMonthDay.length > 0 && !rule.byMonthDay.some(n => (n > 0 ? n : monthLength(y, m) + 1 + n) === d)) { if (date > window.to) break; continue; }
      if (rule.byDay.length > 0 && !rule.byDay.some(w => w.day === weekdayOf(date))) { if (date > window.to) break; continue; }
      if (!take(date)) break;
    }
  } else if (rule.freq === "WEEKLY") {
    const days = rule.byDay.length > 0 ? [...new Set(rule.byDay.map(w => w.day))] : [weekdayOf(start.date)];
    // The first day of the start's week (WKST).
    let weekFirst = addDays(start.date, -((weekdayOf(start.date) - rule.weekStart + 7) % 7));
    outer: for (; steps++ < limit; weekFirst = addDays(weekFirst, 7 * rule.interval)) {
      const week = Array.from({ length: 7 }, (_, i) => addDays(weekFirst, i)).filter(d => days.includes(weekdayOf(d)) && (rule.byMonth.length === 0 || rule.byMonth.includes(ymd(d)[1])));
      for (const date of setPos(week, rule.bySetPos)) if (!take(date)) break outer;
      if (weekFirst > window.to) break;
    }
  } else if (rule.freq === "MONTHLY") {
    outer: for (let i = 0; steps++ < limit; i += rule.interval) {
      const y = y0 + Math.floor((m0 - 1 + i) / 12), m = ((m0 - 1 + i) % 12) + 1;
      if (dateOf(y, m, 1) > window.to) break;
      if (rule.byMonth.length > 0 && !rule.byMonth.includes(m)) continue;
      for (const date of setPos(daysOfMonth(y, m, rule, d0), rule.bySetPos)) if (!take(date)) break outer;
    }
  } else {
    const months = rule.byMonth.length > 0 ? rule.byMonth : [m0];
    outer: for (let i = 0; steps++ < limit; i += rule.interval) {
      const y = y0 + i;
      if (dateOf(y, 1, 1) > window.to) break;
      const all = months.flatMap(m => daysOfMonth(y, m, rule, d0));
      for (const date of setPos(all, rule.bySetPos)) if (!take(date)) break outer;
    }
  }
  return found;
}

// ——— Durations ———

function durationMs(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/u.exec(value.trim());
  if (!m) return null;
  const ms = ((Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * 86400 + Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)) * 1000;
  return m[1] === "-" ? null : ms;
}

// ——— Busy times ———

// busyTimes reads a calendar's text and gives the times its events keep
// busy between two instants, merged, at most icalLimits.spans; zone: the
// host's, for whole days and floating times. Throws NotACalendar for text
// that is not one.
export function busyTimes(text: string, window: { from: number; to: number; zone: string }): Reading {
  const calendar = parse(text);
  const host = ianaZone(isZone(window.zone) ? window.zone : "UTC");
  const defined = new Map<string, Zone>();
  for (const tz of calendar.children.filter(c => c.kind === "VTIMEZONE")) {
    const id = prop(tz, "TZID")?.value.trim();
    const zone = id ? definedZone(tz) : null;
    if (id && zone) defined.set(id, zone);
  }
  const events = calendar.children.filter(c => c.kind === "VEVENT").slice(0, icalLimits.events);
  const dayFrom = new Date(window.from - 2 * 86400000).toISOString().slice(0, 10);
  const dayTo = new Date(window.to + 2 * 86400000).toISOString().slice(0, 10);

  const stampOf = (p: Property | undefined, value = p?.value): Stamp | null => {
    if (!p || value === undefined) return null;
    const read = readStamp(value);
    if (!read) return null;
    const allDay = read.allDay || p.params["VALUE"] === "DATE";
    return { local: read.local, allDay, utc: read.utc, zone: read.utc ? utcZone : allDay ? host : zoneNamed(p.params["TZID"], defined, host) };
  };
  const instant = (s: Stamp, local = s.local) => s.zone(local);

  // Occurrences moved or cancelled by a RECURRENCE-ID event, by UID.
  const replaced = new Map<string, Set<number>>();
  for (const e of events) {
    const rid = stampOf(prop(e, "RECURRENCE-ID"));
    const uid = prop(e, "UID")?.value ?? "";
    if (rid) replaced.set(uid, (replaced.get(uid) ?? new Set()).add(instant(rid)));
  }

  const spans: Span[] = [];
  let counted = 0;
  const add = (start: number, end: number) => {
    if (end <= start || end <= window.from || start >= window.to) return;
    spans.push({ start: Math.max(start, window.from), end: Math.min(end, window.to) });
  };
  for (const e of events) {
    counted++;
    if ((prop(e, "STATUS")?.value ?? "").trim().toUpperCase() === "CANCELLED") continue;
    if ((prop(e, "TRANSP")?.value ?? "").trim().toUpperCase() === "TRANSPARENT") continue;
    const start = stampOf(prop(e, "DTSTART"));
    if (!start) continue;
    const endStamp = stampOf(prop(e, "DTEND"));
    const duration = durationMs(prop(e, "DURATION")?.value ?? "");
    // The length of one occurrence, in wall-clock terms for whole days.
    const allDayDays = start.allDay ? Math.max(1, endStamp ? Math.round((localMs(endStamp.local) - localMs(start.local)) / 86400000) : duration !== null ? Math.round(duration / 86400000) : 1) : 0;
    const firstStart = instant(start);
    const length = start.allDay ? 0 : endStamp ? instant(endStamp) - firstStart : duration ?? 0;
    const occurrence = (local: Local) => {
      if (start.allDay) add(host(local), host({ date: addDays(local.date, allDayDays), minutes: 0 }));
      else {
        const at = start.zone(local);
        add(at, at + length);
      }
    };
    const uid = prop(e, "UID")?.value ?? "";
    const ruleText = prop(e, "RRULE")?.value;
    const rule = ruleText && !prop(e, "RECURRENCE-ID") ? readRule(ruleText) : null;
    if (!rule && !ruleText) {
      occurrence(start.local);
      continue;
    }
    const excluded = new Set<number>(replaced.get(uid) ?? []);
    for (const p of props(e, "EXDATE")) for (const v of p.value.split(",")) {
      const s = stampOf(p, v);
      if (s) excluded.add(start.allDay ? host(s.local) : instant(s));
    }
    // Each occurrence's start: from the rule, then the added dates.
    const starts: { local: Local; at: number }[] = (rule ? expandLocal(start.local, rule, { from: dayFrom, to: dayTo, zone: start.zone }) : [start.local]).map(local => ({ local, at: start.allDay ? host(local) : start.zone(local) }));
    for (const p of props(e, "RDATE")) for (const v of p.value.split(",")) {
      const s = stampOf(p, v.split("/")[0]);
      if (s) starts.push({ local: s.local, at: start.allDay || s.allDay ? host(s.local) : instant(s) });
    }
    for (const { local, at } of starts) {
      if (excluded.has(at)) continue;
      if (start.allDay) occurrence(local);
      else add(at, at + length);
      if (spans.length > icalLimits.spans * 4) break;
    }
  }
  return { spans: merge(spans).slice(0, icalLimits.spans), events: counted };
}

// merge sorts spans and joins those that overlap or touch.
export function merge(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}
