import type { Member } from "@argentic/chest-sdk/member";
import type { Catalogue } from "./i18n/index.ts";
import { clock, formatDate, relative } from "./i18n/index.ts";
import type { Forgotten, RunningView, TimerProps } from "./islands/TimerBar.tsx";
import { can } from "./lib/access.ts";
import { clock as now, zone } from "./lib/clock.ts";
import type { Query } from "./lib/db.ts";
import { lastWork } from "./lib/entries.ts";
import { offeredProjects } from "./lib/projects.ts";
import { isForgotten, timer } from "./lib/timer.ts";
import { seenNow } from "./lib/weeks.ts";
import { workValue } from "./shared/work.ts";

// The timer on top of every page of a member (the layout's island
// TimerBar), as the server sees it now: running since when, on what; the
// projects open to them; their last work (the picker's first choice); a
// forgotten timer's question. Each page asks it (src/app.tsx) and gives it
// to the layout (View.layout). Also the first day this person opened the
// tool: their start on the Team page while they have no entry (once).
export async function timerView(sql: Query, member: Member, locale: string, t: Catalogue, path: string): Promise<TimerProps> {
  const [running, projects, last] = await Promise.all([timer(sql, member), offeredProjects(sql, member), lastWork(sql, member), seenNow(sql, member.id)]);
  const z = zone();
  const at = now.now();
  const view: RunningView | null = running && {
    projectId: running.projectId,
    taskId: running.taskId,
    note: running.note,
    startedAt: running.startedAt,
    elapsed: Math.max(0, Math.floor((at.getTime() - Date.parse(running.startedAt)) / 1000)),
    since: clock(running.startedAt, z, locale),
    projectName: running.projectName,
  };
  let forgotten: Forgotten | null = null;
  if (running && isForgotten(running, at)) {
    // Every quarter of an hour from the start to now (a day at most).
    const started = Date.parse(running.startedAt);
    const end = Math.min(at.getTime(), started + 24 * 3600_000);
    const options: Forgotten["options"] = [];
    for (let s = Math.ceil((started + 60_000) / 900_000) * 900_000; s <= end; s += 900_000) {
      options.push({ value: new Date(s).toISOString(), label: formatDate(new Date(s), z, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) });
    }
    if (at.getTime() <= started + 24 * 3600_000) options.push({ value: "now", label: t.timer.forgotten.now });
    // First guess: 18:00 on the day it started, or eight hours after.
    const startDay = formatDate(running.startedAt, z, "en", { dateStyle: "short" });
    const evening = options.find(o => o.value !== "now" && clock(o.value, z, "en") === "18:00" && formatDate(o.value, z, "en", { dateStyle: "short" }) === startDay);
    const guess = evening ?? options.find(o => o.value !== "now" && Date.parse(o.value) >= started + 8 * 3600_000) ?? options.at(-1);
    forgotten = {
      date: formatDate(running.startedAt, z, locale, { weekday: "long", day: "numeric", month: "long" }),
      time: clock(running.startedAt, z, locale),
      ago: relative(running.startedAt, locale, at),
      options,
      chosen: guess?.value ?? "now",
    };
  }
  const lastValue = last && projects.some(p => p.id === last.projectId && (last.taskId === null || p.tasks.some(k => k.id === last.taskId))) ? workValue(last) : "";
  return {
    running: view,
    forgotten,
    projects,
    last: lastValue,
    canManage: can(member, "projects.manage"),
    onProjects: path.startsWith("/chest/projects"),
    serverNow: at.getTime(),
    t: { timer: t.timer, work: t.work, dialog: t.kit.dialog },
  };
}
