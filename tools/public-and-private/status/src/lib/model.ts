import { field } from "@argentic/chest-app";
import { AppError } from "./app-error.ts";
import { instantOf, isDate } from "./zone.ts";

// The rules of what an editor writes and of what the page shows. No
// framework, no database: safe in the browser, tested alone.

export const limits = {
  componentName: 80,
  componentDescription: 200,
  components: 60,
  title: 160,
  body: 5000,
  backfillDays: 366,
  maintenanceAheadDays: 366,
  maintenanceHours: 24 * 7,
  subscribers: 10000,
  email: 254,
  historyDays: 90,
} as const;

// The state of a component, from best to worst. "maintenance" is planned:
// it is shown, never counted as downtime.
export const states = ["operational", "maintenance", "degraded", "partial", "major"] as const;
export type State = (typeof states)[number];
// What an incident can say of a component (operational: not affected).
export const impacts = ["degraded", "partial", "major"] as const;
export type Impact = (typeof impacts)[number];
export const isImpact = (v: unknown): v is Impact => typeof v === "string" && (impacts as readonly string[]).includes(v);

export const severity: Record<State, number> = { operational: 0, maintenance: 1, degraded: 2, partial: 3, major: 4 };
export function worst(list: Iterable<State>): State {
  let found: State = "operational";
  for (const s of list) if (severity[s] > severity[found]) found = s;
  return found;
}

// How much of a minute a state costs the uptime — Atlassian Statuspage's
// documented rule, so a company moving from it keeps its figures: a major
// outage counts in full, a partial outage for 30 %, degraded performance
// and planned maintenance not at all ("Display historical uptime of
// components", https://support.atlassian.com/statuspage/docs/display-historical-uptime-of-components/,
// read through a web search on 2026-09-29). Slower days are said beside the
// figure (history bar), so "100 %" never stands alone next to yellow days.
export const downtimeWeight: Record<State, number> = { operational: 0, maintenance: 0, degraded: 0, partial: 0.3, major: 1 };

// The steps of an incident, and of a maintenance.
export const incidentSteps = ["investigating", "identified", "monitoring", "resolved"] as const;
export type IncidentStep = (typeof incidentSteps)[number];
export const openSteps = ["investigating", "identified", "monitoring"] as const;
export const maintenanceSteps = ["scheduled", "in_progress", "update", "completed", "cancelled"] as const;
export type MaintenanceStep = (typeof maintenanceSteps)[number];
// After "Resolved", an incident may get one post-mortem: what happened and
// what was changed. It is an update of its own step that changes no state.
export type Step = IncidentStep | MaintenanceStep | "postmortem";
export const isIncidentStep = (v: unknown): v is IncidentStep => typeof v === "string" && (incidentSteps as readonly string[]).includes(v);

// clean trims a text and bounds it; line breaks are kept only where the
// text may have several lines; other control characters are dropped.
export function clean(value: unknown, max: number, options: { multiline?: boolean; optional?: boolean } = {}): string {
  if (typeof value !== "string") throw new AppError("invalid");
  let text = value.replace(/\r\n?/gu, "\n");
  text = options.multiline ? text.replace(/[^\P{Cc}\n\t]/gu, "").replace(/\n{3,}/gu, "\n\n") : text.replace(/\s+/gu, " ").replace(/\p{Cc}/gu, "");
  text = text.replace(/[‪-‮⁦-⁩]/gu, "").trim();
  if (text === "" && !options.optional) throw new AppError("empty");
  if ([...text].length > max) throw new AppError("too_long", { max });
  return text;
}

// An optional text: null when absent or blank, else cleaned and bounded
// like the text it goes with (the second-language version of a title or
// of an update).
export function optionalText(value: unknown, max: number, options: { multiline?: boolean } = {}): string | null {
  if (value === undefined || value === null) return null;
  const text = clean(value, max, { ...options, optional: true });
  return text === "" ? null : text;
}

const idPattern = /^[1-9][0-9]{0,17}$/u;
// id reads an identifier of a row; anything else names nothing.
export function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !idPattern.test(value)) throw new AppError("not_found");
  return value;
}

// A moment typed by an editor: a day and minutes after midnight, in the
// Chest's time zone (24-hour selects, never the browser's clock).
export function moment(dayValue: unknown, minutesValue: unknown, zone: string): Date {
  const minutes = typeof minutesValue === "string" ? Number(minutesValue) : minutesValue;
  if (!isDate(dayValue) || typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) throw new AppError("invalid_time");
  const year = Number(dayValue.slice(0, 4));
  if (year < 2000 || year > 2100) throw new AppError("invalid_time");
  return instantOf(dayValue, minutes, zone);
}

// The affected components of an update: {componentId: impact}, 1 to 60.
export function affected(value: unknown, options: { optional?: boolean } = {}): Map<string, Impact> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new AppError("invalid");
  const found = new Map<string, Impact>();
  for (const [key, impact] of Object.entries(value as Record<string, unknown>)) {
    if (!isImpact(impact)) throw new AppError("invalid");
    found.set(id(key), impact);
  }
  if (found.size === 0 && !options.optional) throw new AppError("no_components");
  if (found.size > limits.components) throw new AppError("too_many", { max: limits.components });
  return found;
}

export function componentIds(value: unknown, options: { optional?: boolean } = {}): string[] {
  if (!Array.isArray(value)) throw new AppError("invalid");
  const ids = [...new Set(value.map(v => id(v)))];
  if (ids.length === 0 && !options.optional) throw new AppError("no_components");
  if (ids.length > limits.components) throw new AppError("too_many", { max: limits.components });
  return ids;
}

// An email address as the subscribe form takes it: the package's rule
// (field.email: trimmed, the domain lower-cased, the part before the @ as
// written; display names, controls, quotes, IP literals refused with
// "invalid_email", "" with "empty", past 254 characters "too_long"). The
// action takes the text loosely and checks it here, inside the form's
// try, so a refusal goes back to the page with what was typed. Compared
// lowercase (lower(…) in SQL, the budget's subject). The Chest checks it
// again (isAddress).
const address = field.email({ max: limits.email });
export function email(value: unknown): string {
  if (typeof value !== "string") throw new AppError("invalid_email");
  return address.read(value);
}
