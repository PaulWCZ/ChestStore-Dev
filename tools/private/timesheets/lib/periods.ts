// Safe in the browser: no SDK here.
// The periods of a report: this week, last week, this month, last month,
// or two days chosen. Weeks start on Monday.
import { addDays, daysBetween, isDay, mondayOf, monthEnd, monthStart } from "./days.ts";

export const presets = ["week", "lastWeek", "month", "lastMonth", "custom"] as const;
export type Preset = (typeof presets)[number];
export type Period = { preset: Preset; from: string; to: string };

export const isPreset = (value: unknown): value is Preset => typeof value === "string" && (presets as readonly string[]).includes(value);

export function period(preset: unknown, today: string, from?: unknown, to?: unknown, maxDays = 366): Period {
  switch (isPreset(preset) ? preset : "week") {
    case "lastWeek": {
      const monday = addDays(mondayOf(today), -7);
      return { preset: "lastWeek", from: monday, to: addDays(monday, 6) };
    }
    case "month":
      return { preset: "month", from: monthStart(today), to: monthEnd(today) };
    case "lastMonth": {
      const last = addDays(monthStart(today), -1);
      return { preset: "lastMonth", from: monthStart(last), to: last };
    }
    case "custom":
      if (isDay(from) && isDay(to) && from <= to && daysBetween(from, to) < maxDays) return { preset: "custom", from, to };
      if (isDay(from) && isDay(to) && from <= to) return { preset: "custom", from, to: addDays(from, maxDays - 1) };
      return period("week", today);
    default: {
      const monday = mondayOf(today);
      return { preset: "week", from: monday, to: addDays(monday, 6) };
    }
  }
}
