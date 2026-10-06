import type { Member } from "@argentic/chest-sdk/member";
import { Island } from "@argentic/chest-app";
import { AppShell, BrandMark, type NavItem } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Alert, Chart, Check, Clock, Gear, Inbox, Person, Reply, Star } from "../components/icons.tsx";
import { Mark } from "../components/mark.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { can, roleOf } from "../lib/access.ts";
import type { FolderCounts } from "../lib/tickets.ts";
import { viewHref, type View } from "../lib/views.ts";

// The team's frame, in the kit's shell: Support's sections as labelled
// tabs (Inbox, Reports, Settings — a row of their own on a phone), who is
// signed in at the right, the keyboard shortcuts (an island: ? lists them)
// and the page reading itself again every 20 seconds while it is seen
// (the Chest has no WebSocket; refresh() keeps what is typed).
//
// Beside the page, the inbox's folders and the team's saved views: a
// column on a wide screen (as in every shared inbox: they are where the
// work is), on a narrow window a row of labelled chips that scrolls
// sideways, and on a phone one choice ("Unassigned (3) ▾") above the
// inbox — the first ticket stays near the top, and a ticket's answer box
// is never pushed down. They are the inbox's filters, not sections.
//
// A member without a role — most colleagues, who ask the team something
// with a team form of Forms — has one section: My requests.
export type Desk = { counts: FolderCounts; views: View[]; mine: number };

export function TeamFrame({ member, t, path, query, logo, notice, desk, children }: { member: Member; t: Catalogue; path: string; query?: URLSearchParams; logo: { url: string; alt: string; dark?: string | null } | null; notice: string | null; desk: Desk | null; children: ReactNode }) {
  const role = roleOf(member);
  const params = query ?? new URLSearchParams();
  const onMine = /^\/chest\/mine(\/|$)/u.test(path);
  const mineItem: NavItem = { href: "/chest/mine", label: t.shell.mine, icon: <Reply /> };
  const brand = <a href="/chest"><BrandMark logo={logo}><Mark /></BrandMark><span className="brand-name">{t.tool.name}</span></a>;
  const person = { name: member.name, role: role ? t.roles[role] : null, photo: member.photo };
  // A ticket and a new ticket are parts of the inbox: its tab stays current.
  const nav: NavItem[] = role ? [
    { href: "/chest", label: t.shell.inbox, icon: <Inbox />, match: "exact", also: ["/chest/tickets", "/chest/new"] },
    ...(can(member, "reports") ? [{ href: "/chest/reports", label: t.shell.reports, icon: <Chart /> }] : []),
    { href: "/chest/settings", label: t.shell.settings, icon: <Gear /> },
    // Someone who answers may also have asked something themselves.
    ...((desk?.mine ?? 0) > 0 || onMine ? [mineItem] : []),
  ] : [mineItem];
  const f = t.inbox.folders;
  const counts = role ? desk?.counts : undefined;
  const folders: { key: string; href: string; label: string; count: number | null; icon: ReactNode }[] = counts ? [
    { key: "unassigned", href: "/chest?folder=unassigned", label: f.unassigned, count: counts.unassigned, icon: <Inbox /> },
    { key: "mine", href: "/chest?folder=mine", label: f.mine, count: counts.mine, icon: <Person /> },
    { key: "open", href: "/chest?folder=open", label: f.open, count: counts.open, icon: <Alert /> },
    { key: "waiting", href: "/chest?folder=waiting", label: f.waiting, count: counts.waiting, icon: <Clock /> },
    { key: "closed", href: "/chest?folder=closed", label: f.closed, count: null, icon: <Check /> },
    ...(counts.spam > 0 ? [{ key: "spam", href: "/chest?folder=spam", label: f.spam, count: counts.spam, icon: <Alert /> }] : []),
  ] : [];
  const views = role && desk ? desk.views.map(v => ({ id: v.id, href: viewHref(v.params), name: v.name })) : [];
  const inbox = path === "/chest";
  // A folder is the page shown when the inbox shows it with no search or
  // filter (the inbox without one is "unassigned"); a view, when the inbox
  // shows exactly its parameters.
  const same = (a: URLSearchParams, b: URLSearchParams) => [...a.keys(), ...b.keys()].every(k => a.get(k) === b.get(k));
  const folderShown = (key: string) => inbox && !params.get("q") && !params.get("tag") && !params.get("priority") && (params.get("folder") ?? "unassigned") === key;
  const viewShown = (href: string) => inbox && same(params, new URLSearchParams(href.split("?")[1] ?? ""));
  // The folder or view the inbox shows, for the phone's choice ("" for a
  // search or a filter of one's own).
  const viewNow = views.find(v => viewShown(v.href));
  const listShown = folders.find(x => folderShown(x.key))?.key ?? (viewNow ? "view:" + viewNow.id : "");
  return (
    <AppShell brand={brand} nav={nav} path={path} member={person} labels={{ ...t.kit.shell, skip: t.shell.skip, nav: t.shell.nav }} width="full">
      <Island name="Keys" props={{ canCreate: role !== null && can(member, "tickets.answer"), t: { keys: t.shell.keys, keysClose: t.shell.keysClose, keyList: t.shell.keyList, dialog: t.kit.dialog } }} />
      <Island name="AutoRefresh" props={{ seconds: 20 }} />
      <div className={`desk${inbox ? " on-inbox" : ""}${folders.length === 0 ? " bare" : ""}`}>
        {folders.length > 0 && (
          <nav className="folders" aria-label={t.shell.folders}>
            <ul>
              {folders.map(x => (
                <li key={x.key}>
                  <a href={x.href} aria-current={folderShown(x.key) ? "page" : undefined}>{x.icon}<span className="label">{x.label}</span>{x.count !== null && <span className="n">{x.count}</span>}</a>
                </li>
              ))}
            </ul>
            {views.length > 0 && (
              <>
                <p className="nav-head" id="views-head">{t.shell.views}</p>
                <ul aria-labelledby="views-head">
                  {views.map(v => (
                    <li key={v.id}><a href={v.href} aria-current={viewShown(v.href) ? "page" : undefined}><Star /><span className="label">{v.name}</span></a></li>
                  ))}
                </ul>
              </>
            )}
          </nav>
        )}
        <div className="desk-main">
          {/* On a phone the folders are one choice above the inbox, not a
              row of chips that runs off the screen. */}
          {inbox && folders.length > 0 && (
            <Island name="FolderSelect" props={{
              label: t.shell.folders, otherList: t.shell.otherList, viewsLabel: t.shell.views, current: listShown,
              options: [...folders.map(x => ({ value: x.key, label: x.count !== null ? `${x.label} (${x.count})` : x.label, href: x.href, view: false })), ...views.map(v => ({ value: "view:" + v.id, label: v.name, href: v.href, view: true }))],
            }} />
          )}
          {notice && <p className="notice danger" role="alert">{notice}</p>}
          {children}
        </div>
      </div>
    </AppShell>
  );
}
