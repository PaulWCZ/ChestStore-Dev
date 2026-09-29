// Times of day as minutes since midnight (0 … 1440), written on a 24-hour
// clock the same everywhere ("09:30", and "24:00" for the end of a day).
// The browser's own time field follows the computer's locale (AM/PM on
// many) and cuts the text; the kit's TimeSelect is a list of these.

export const endOfDay = 1440;

export function timeText(minutes: number): string {
  const m = Math.max(0, Math.min(endOfDay, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// parseTime reads "9:30", "09h30", "930", "9" → minutes, or null.
export function parseTime(text: string): number | null {
  const t = text.trim().toLowerCase();
  const m = /^(\d{1,2})(?:\s*[:h.]\s*(\d{2})?)?$/u.exec(t) ?? /^(\d{1,2})(\d{2})$/u.exec(t);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

export type TimeOptions = { step?: number; end?: boolean; min?: number; max?: number };

// timeOptions: the choices of a TimeSelect. A start runs from min to the
// last step before max; an end (end: true) from min + step to max, so
// "24:00" closes a day.
export function timeOptions({ step = 15, end = false, min = 0, max = endOfDay }: TimeOptions = {}): number[] {
  if (!Number.isInteger(step) || step < 1 || step > endOfDay) throw new RangeError("step is a whole number of minutes, 1 to 1440");
  const list: number[] = [];
  const from = end ? min + step : min;
  const to = end ? max : max - step;
  for (let m = from; m <= to; m += step) list.push(m);
  return list;
}

// moveStart: when a person moves the start of a slot, the end follows so
// the duration stays (a one-hour meeting moved from 09:00 to 14:00 ends at
// 15:00, not at 10:00 — the bug of Rooms). The end never passes max: then
// the slot shortens, and it is never shorter than one step.
export function moveStart(slot: { start: number; end: number }, start: number, { step = 15, max = endOfDay }: { step?: number; max?: number } = {}): { start: number; end: number } {
  const duration = Math.max(step, slot.end - slot.start);
  const s = Math.max(0, Math.min(start, max - step));
  return { start: s, end: Math.min(max, s + duration) };
}

// moveEnd: an end before (or at) the start pushes the start back one
// duration of a step, never past midnight.
export function moveEnd(slot: { start: number; end: number }, end: number, { step = 15 }: { step?: number } = {}): { start: number; end: number } {
  const e = Math.max(step, Math.min(endOfDay, end));
  return e > slot.start ? { start: slot.start, end: e } : { start: Math.max(0, e - step), end: e };
}
