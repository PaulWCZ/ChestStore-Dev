import type { ReactNode } from "react";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Avatar } from "../../components/avatar.tsx";
import { Fab, FolderMenu } from "../../components/folder-menu.tsx";
import { Alert, Chart, Check, Clock, Gear, Inbox, Person, Plus, Star } from "../../components/icons.tsx";
import { Keys } from "../../components/keys.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { viewer } from "../../lib/session.ts";
import { folderCounts } from "../../lib/tickets.ts";
import { listViews, viewHref } from "../../lib/views.ts";

// The team's part: folders and the team's saved views on the side (with
// what waits in each), the page beside. On a phone, the side column is a
// line: the name, a menu of the folders, and a round button for a new
// ticket. proxy.ts refused anyone the Chest did not sign in.
export default async function TeamLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  if (!role) {
    return (
      <main className="main">
        <div className="empty"><h1>{t.noAccess.title}</h1><p>{t.noAccess.body}</p></div>
      </main>
    );
  }
  const sql = db();
  const [counts, views] = await Promise.all([folderCounts(sql, member), listViews(sql, member)]);
  const f = t.inbox.folders;
  const folders = [
    { key: "unassigned", href: "/chest?folder=unassigned", label: f.unassigned, count: counts.unassigned, icon: <Inbox /> },
    { key: "mine", href: "/chest?folder=mine", label: f.mine, count: counts.mine, icon: <Person /> },
    { key: "open", href: "/chest?folder=open", label: f.open, count: counts.open, icon: <Alert /> },
    { key: "waiting", href: "/chest?folder=waiting", label: f.waiting, count: counts.waiting, icon: <Clock /> },
    { key: "closed", href: "/chest?folder=closed", label: f.closed, count: null, icon: <Check /> },
    ...(counts.spam > 0 ? [{ key: "spam", href: "/chest?folder=spam", label: f.spam, count: counts.spam, icon: <Alert /> }] : []),
  ];
  const pages = [
    ...(can(member, "reports") ? [{ href: "/chest/reports", label: t.shell.reports, icon: <Chart /> }] : []),
    { href: "/chest/settings", label: t.shell.settings, icon: <Gear /> },
  ];
  const canCreate = can(member, "tickets.answer");
  return (
    <Toasts>
      <AutoRefresh seconds={20} />
      <Keys canCreate={canCreate} t={t.shell} />
      <a className="skip" href="#main">{t.shell.skip}</a>
      <div className="app">
        <aside className="side">
          <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
          <nav aria-label={t.shell.nav} className="folders">
            {folders.map(x => <NavLink key={x.key} href={x.href} match={x.key}>{x.icon}{x.label}{x.count !== null && <span className="n">{x.count}</span>}</NavLink>)}
            {views.length > 0 && <p className="nav-head" id="views-head">{t.shell.views}</p>}
            {views.map(x => <NavLink key={x.id} href={viewHref(x.params)} view><Star />{x.name}</NavLink>)}
            <span className="sep" />
            {canCreate && <NavLink href="/chest/new"><Plus />{t.shell.new}</NavLink>}
            {pages.map(x => <NavLink key={x.href} href={x.href}>{x.icon}{x.label}</NavLink>)}
          </nav>
          <FolderMenu label={t.shell.folder} options={[
            ...folders.map(x => ({ href: x.href, label: x.count ? `${x.label} (${x.count})` : x.label, match: x.key })),
            ...views.map(x => ({ href: viewHref(x.params), label: x.name, view: true })),
            ...pages.map(x => ({ href: x.href, label: x.label })),
          ]} />
          <span className="me">
            <Avatar name={member.name} photo={member.photo} />
            <span className="who">{member.firstName || member.name} · {t.roles[role]}</span>
          </span>
        </aside>
        <div className="main" id="main">{children}</div>
      </div>
      {canCreate && <Fab label={t.shell.new}><Plus /></Fab>}
    </Toasts>
  );
}
