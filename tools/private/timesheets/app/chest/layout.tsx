import type { ReactNode } from "react";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Avatar } from "../../components/avatar.tsx";
import { Bars, Folder, Gear, Grid } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { workValue } from "../../lib/work.ts";
import { can, roleOf } from "../../lib/access.ts";
import { clock as now, zone } from "../../lib/clock.ts";
import { db } from "../../lib/db.ts";
import { lastWork } from "../../lib/entries.ts";
import { clock, formatDate, relative } from "../../lib/i18n/index.ts";
import { offeredProjects } from "../../lib/projects.ts";
import { viewer } from "../../lib/session.ts";
import { isForgotten, timer } from "../../lib/timer.ts";
import { TimerBar, type Forgotten, type RunningView } from "./timer-bar.tsx";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error. The
// timer sits on top of every page; on a phone the tabs sit at the bottom,
// under the thumb.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const role = roleOf(member);
  if (!role) {
    return (
      <>
        <header className="top"><a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a></header>
        <main id="main" className="page narrow">
          <div className="empty">
            <h1>{t.noAccess.title}</h1>
            <p>{t.noAccess.body}</p>
          </div>
        </main>
      </>
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
  return (
    <Toasts>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="top">
        <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
        <nav className="tabs" aria-label={t.shell.nav}>
          <NavLink href="/chest" exact><Grid /><span className="tab-label">{t.shell.week}</span></NavLink>
          <NavLink href="/chest/reports"><Bars /><span className="tab-label">{t.shell.reports}</span></NavLink>
          {can(member, "projects.manage") && <NavLink href="/chest/projects"><Folder /><span className="tab-label">{t.shell.projects}</span></NavLink>}
          {can(member, "settings") && <NavLink href="/chest/settings"><Gear /><span className="tab-label">{t.shell.settings}</span></NavLink>}
        </nav>
        <span className="me">
          <span className="who">{member.firstName || member.name}<span className="role">{t.roles[role]}</span></span>
          <Avatar name={member.name} photo={member.photo} />
        </span>
      </header>
      <TimerBar
        running={view}
        forgotten={forgotten}
        projects={projects}
        last={lastValue}
        canManage={can(member, "projects.manage")}
        serverNow={at.getTime()}
        t={{ timer: t.timer, work: t.work, errors: t.errors }}
      />
      <AutoRefresh seconds={60} />
      <div id="main">{children}</div>
    </Toasts>
  );
}
