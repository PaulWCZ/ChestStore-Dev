import { BrandMark, NoAccess, Toasts, type NavItem } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Bars, Folder, Gear, Grid, People } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { workValue } from "../../lib/work.ts";
import { can, roleOf } from "../../lib/access.ts";
import { clock as now, zone } from "../../lib/clock.ts";
import { db } from "../../lib/db.ts";
import { lastWork } from "../../lib/entries.ts";
import { clock, formatDate, relative } from "../../lib/i18n/index.ts";
import { offeredProjects } from "../../lib/projects.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";
import { isForgotten, timer } from "../../lib/timer.ts";
import { TimerBar, type Forgotten, type RunningView } from "./timer-bar.tsx";

// The members' part, in the kit's shell: the instrument panel on top (the
// tool's mark, or the company's logo in brand mode; the sections as
// labelled tabs; the member), the timer under it on every page.
// proxy.ts already refused a request without the Chest's assertion; a
// member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, locale, t } = v;
  const role = roleOf(member);
  const brand = <a href="/chest"><BrandMark logo={look.logo} ground="dark"><Mark /></BrandMark><span>{t.meta.name}</span></a>;
  const labels = { skip: t.shell.skip, nav: t.shell.nav };
  if (!role) {
    return (
      <Shell brand={brand} labels={labels} width="narrow">
        <div className="page narrow">
          <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />
        </div>
      </Shell>
    );
  }
  const sql = db();
  const [running, projects, last] = await Promise.all([timer(sql, member), offeredProjects(sql, member), lastWork(sql, member)]);
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
    const last = Math.min(at.getTime(), started + 24 * 3600_000);
    const options: Forgotten["options"] = [];
    for (let s = Math.ceil((started + 60_000) / 900_000) * 900_000; s <= last; s += 900_000) {
      options.push({ value: new Date(s).toISOString(), label: formatDate(new Date(s), z, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) });
    }
    if (at.getTime() <= started + 24 * 3600_000) options.push({ value: "now", label: t.timer.forgotten.now });
    // First guess: 18:00 on the day it started, or eight hours after.
    const evening = options.find(o => o.value !== "now" && clock(o.value, z, "en") === "18:00" && formatDate(o.value, z, "en", { dateStyle: "short" }) === formatDate(running.startedAt, z, "en", { dateStyle: "short" }));
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
  const nav: NavItem[] = [
    { href: "/chest", label: t.shell.week, icon: <Grid />, exact: true },
    { href: "/chest/reports", label: t.shell.reports, icon: <Bars /> },
    ...(can(member, "approve") ? [{ href: "/chest/team", label: t.shell.team, icon: <People /> }] : []),
    ...(can(member, "projects.manage") ? [{ href: "/chest/projects", label: t.shell.projects, icon: <Folder /> }] : []),
    ...(can(member, "settings") ? [{ href: "/chest/settings", label: t.shell.settings, icon: <Gear /> }] : []),
  ];
  return (
    <Shell brand={brand} nav={nav} member={{ name: member.name, role: t.roles[role], photo: member.photo }} labels={labels} width="full">
      <Toasts labels={t.toast}>
        <TimerBar
          running={view}
          forgotten={forgotten}
          projects={projects}
          last={lastValue}
          canManage={can(member, "projects.manage")}
          serverNow={at.getTime()}
          t={{ timer: t.timer, work: t.work, errors: t.errors, dialog: t.dialog }}
        />
        <AutoRefresh seconds={60} />
        {children}
      </Toasts>
    </Shell>
  );
}
