import { AppError } from "./app-error.ts";

// The rules of what a person writes and books, and the shapes pages
// receive. No framework, no database: tested alone. Safe in the browser.

export const limits = {
  officeName: 80,
  address: 200,
  floorName: 60,
  areaName: 60,
  roomName: 60,
  roomNote: 200,
  deskName: 40,
  title: 120,
  capacity: 999,
  attendees: 50,
  desksAtOnce: 50,
  officesMax: 20,
  floorsPerOffice: 50,
  roomsPerOffice: 200,
  desksPerOffice: 2000,
  photoSize: 10 << 20,
  exportDays: 366,
  search: 60,
} as const;

// The equipment a room may have, and what a desk may offer: keys the
// catalogues name.
export const equipment = ["screen", "video", "whiteboard", "phone", "accessible"] as const;
export type Equipment = (typeof equipment)[number];
export const features = ["screen", "dock", "standing", "window", "quiet"] as const;
export type Feature = (typeof features)[number];

// The floors and areas the tool names itself (the sample, "Start with an
// example") are keys: each reader sees them in their own language (the
// catalogues' `presets`) until an admin renames them.
export const floorPresets = ["ground", "first", "second", "third"] as const;
export const areaPresets = ["open_space", "quiet_zone"] as const;
export type Preset = (typeof floorPresets)[number] | (typeof areaPresets)[number];
export function placeName(name: string, preset: string | null | undefined, words: Readonly<Record<string, string>> | undefined): string {
  return (preset && words?.[preset]) || name;
}

export const statuses = ["office", "remote", "off"] as const;
export type Status = (typeof statuses)[number];
export const isStatus = (value: unknown): value is Status => typeof value === "string" && (statuses as readonly string[]).includes(value);

// A desk is booked for the whole day, the morning (before noon) or the afternoon.
export const parts = ["day", "am", "pm"] as const;
export type Part = (typeof parts)[number];
export const isPart = (value: unknown): value is Part => typeof value === "string" && (parts as readonly string[]).includes(value);
// The minutes of the day each part covers, in the Chest's time zone.
export const partMinutes: Record<Part, [number, number]> = { day: [0, 1440], am: [0, 720], pm: [720, 1440] };
export const overlaps = (a: Part, b: Part): boolean => partMinutes[a][0] < partMinutes[b][1] && partMinutes[b][0] < partMinutes[a][1];

// The rooms' grid moves in steps of a quarter of an hour.
export const step = 15;

// clean trims a text and bounds it; line breaks are dropped (every text of
// this tool is one line), and so are other control characters.
export function clean(value: unknown, max: number, options: { optional?: boolean } = {}): string {
  if (value === undefined && options.optional) return "";
  if (typeof value !== "string") throw new AppError("invalid");
  const text = value.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "").trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

const idPattern = /^[1-9][0-9]{0,17}$/u;
// id reads an identifier of a row; anything else names nothing.
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !idPattern.test(value)) throw new AppError("not_found");
  return value;
}

export const memberPattern = /^mbr_[a-z2-7]{26}$/u;
export function memberId(value: unknown): string {
  if (typeof value !== "string" || !memberPattern.test(value)) throw new AppError("invalid");
  return value;
}
export function memberIds(value: unknown, max: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(v => typeof v === "string" && memberPattern.test(v))) throw new AppError("invalid");
  const ids = [...new Set(value as string[])];
  if (ids.length > max) throw new AppError("too_many", { max });
  return ids;
}

// A subset of a list of keys, each once, in the list's order.
export function keysOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(v => typeof v === "string" && (allowed as readonly string[]).includes(v))) throw new AppError("invalid");
  return allowed.filter(k => (value as string[]).includes(k));
}

// A whole number within bounds.
export function int(value: unknown, min: number, max: number): number {
  const n = typeof value === "string" && /^-?\d{1,9}$/u.test(value.trim()) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new AppError("invalid");
  return n;
}

// A day is YYYY-MM-DD, between 2000 and 2100.
export function day(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new AppError("invalid");
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AppError("invalid");
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) throw new AppError("invalid");
  return value;
}

// Today in a time zone (the Chest's), as a day.
export function today(zone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Minutes since midnight now, in a time zone.
export function minutesNow(zone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? "0");
  return get("hour") * 60 + get("minute");
}

// Calendar arithmetic on days (no time zone: a day is a day).
export function addDays(d: string, n: number): string {
  const date = new Date(d + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}
// ISO weekday: 1 = Monday … 7 = Sunday.
export function weekday(d: string): number {
  const w = new Date(d + "T00:00:00Z").getUTCDay();
  return w === 0 ? 7 : w;
}
export function mondayOf(d: string): string {
  return addDays(d, 1 - weekday(d));
}

// The working days of this week and the next, from the Monday of today.
export function twoWeeks(todayDay: string, weekdays: readonly number[]): string[] {
  const monday = mondayOf(todayDay);
  return Array.from({ length: 14 }, (_, i) => addDays(monday, i)).filter(d => weekdays.includes(weekday(d)));
}

// The next working day from a day (itself included), within four weeks.
export function nextWorkingDay(from: string, weekdays: readonly number[]): string {
  for (let i = 0; i < 28; i++) {
    const d = addDays(from, i);
    if (weekdays.includes(weekday(d))) return d;
  }
  return from;
}

// A time of the rooms' grid: minutes after midnight, on a quarter hour.
export function minutes(value: unknown): number {
  const n = int(value, 0, 1440);
  if (n % step !== 0) throw new AppError("invalid");
  return n;
}

// "09:30" for 570 minutes; 1440 is "24:00".
export function clock(m: number): string {
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

// The free stretches of a day between bookings, within opening hours.
export function freeSlots(taken: readonly { start: number; end: number }[], open: number, close: number, from = open): { start: number; end: number }[] {
  const slots: { start: number; end: number }[] = [];
  let cursor = Math.max(open, Math.ceil(from / step) * step);
  for (const b of [...taken].sort((a, b) => a.start - b.start)) {
    if (b.end <= cursor) continue;
    if (b.start > cursor) slots.push({ start: cursor, end: Math.min(b.start, close) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= close) break;
  }
  if (cursor < close) slots.push({ start: cursor, end: close });
  return slots.filter(s => s.end - s.start >= step);
}

// The next free desk name in a series: "D-07" after "D-06", "12" after "11".
export function nextNames(existing: readonly string[], count: number, prefix = "D-"): string[] {
  let highest = 0;
  let width = 2;
  let stem = prefix;
  for (const name of existing) {
    const m = /^(.*?)(\d+)$/u.exec(name);
    if (!m) continue;
    const n = Number(m[2]);
    if (n >= highest) {
      highest = n;
      width = m[2]!.length;
      stem = m[1]!;
    }
  }
  return Array.from({ length: count }, (_, i) => stem + String(highest + i + 1).padStart(width, "0"));
}
