import { BrandMark } from "@argentic/chest-ui/components";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Alert, Chart, Check, Clock, Gear, Inbox, Person, Reply, Star } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { TeamShell } from "../../components/team-shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";
import { folderCounts, myOpenCount } from "../../lib/tickets.ts";
import { listViews, viewHref } from "../../lib/views.ts";

// The team's part, in the kit's shell (components/team-shell.tsx): the
// sections as labelled tabs, who is signed in at the right, and beside the
// page the inbox's folders and the team's saved views with what waits in
// each. proxy.ts refused anyone the Chest did not sign in.
//
// A member without a role — most colleagues, who ask the team something
// with a team form of Forms — has one section: My requests, their own
// tickets and nothing else. Any other page of the team's part leads them
// there (a ticket's address to their own view of it, when it is theirs).
export default async function TeamLayout({ children }: { children: ReactNode }) {
  const [v, look, h] = await Promise.all([viewer(), currentLook(), headers()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const path = h.get("x-support-path") ?? "/chest";
  const onMine = /^\/chest\/mine(\/|$)/u.test(path);
  const mineItem = { href: "/chest/mine", label: t.shell.mine, icon: <Reply /> };
  const brand = <a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span className="brand-name">{t.meta.name}</span></a>;
  const person = { name: member.name, role: role ? t.roles[role] : null, photo: member.photo };
  const shell = { skip: t.shell.skip, nav: t.shell.nav, folders: t.shell.folders, views: t.shell.views, otherList: t.shell.otherList };
  const keys = { keys: t.shell.keys, keysClose: t.shell.keysClose, keyList: t.shell.keyList, dialog: t.dialog };
  if (!role) {
    if (!onMine) {
      const ticket = /^\/chest\/tickets\/([0-9]{1,9})$/u.exec(path);
      redirect(ticket ? `/chest/mine/${ticket[1]}` : "/chest/mine");
    }
    return (
      <TeamShell brand={brand} nav={[mineItem]} member={person} folders={[]} views={[]} labels={shell} toast={t.toast} keys={keys} canCreate={false} icons={{ view: <Star /> }}>
        {children}
      </TeamShell>
    );
  }
  const sql = db();
  const [counts, views, mine] = await Promise.all([folderCounts(sql, member), listViews(sql, member), myOpenCount(sql, member)]);
  const f = t.inbox.folders;
  const folders = [
    { key: "unassigned", href: "/chest?folder=unassigned", label: f.unassigned, count: counts.unassigned, icon: <Inbox /> },
    { key: "mine", href: "/chest?folder=mine", label: f.mine, count: counts.mine, icon: <Person /> },
    { key: "open", href: "/chest?folder=open", label: f.open, count: counts.open, icon: <Alert /> },
    { key: "waiting", href: "/chest?folder=waiting", label: f.waiting, count: counts.waiting, icon: <Clock /> },
    { key: "closed", href: "/chest?folder=closed", label: f.closed, count: null, icon: <Check /> },
    ...(counts.spam > 0 ? [{ key: "spam", href: "/chest?folder=spam", label: f.spam, count: counts.spam, icon: <Alert /> }] : []),
  ];
  // A ticket and a new ticket are parts of the inbox: its tab stays current.
  const nav = [
    { href: "/chest", label: t.shell.inbox, icon: <Inbox />, match: "exact" as const, also: ["/chest/tickets", "/chest/new"] },
    ...(can(member, "reports") ? [{ href: "/chest/reports", label: t.shell.reports, icon: <Chart /> }] : []),
    { href: "/chest/settings", label: t.shell.settings, icon: <Gear /> },
    // Someone who answers may also have asked something themselves.
    ...(mine > 0 || onMine ? [mineItem] : []),
  ];
  return (
    <TeamShell brand={brand} nav={nav} member={person} folders={folders} views={views.map(x => ({ id: x.id, href: viewHref(x.params), name: x.name }))}
      labels={shell} toast={t.toast} keys={keys} canCreate={can(member, "tickets.answer")} icons={{ view: <Star /> }}>
      {children}
    </TeamShell>
  );
}
