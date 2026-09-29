import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Avatar } from "../../components/avatar.tsx";
import { External, Search } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import * as outbox from "../../lib/outbox.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";

export const metadata = { robots: { index: false, follow: false } };

// The team's part: the jobs, the talent pool, the reports, the careers
// page's settings, a search, who you are.
// proxy.ts refused anyone the Chest did not sign in; a member whose role
// gives nothing sees why, not an error.
export default async function TeamLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  if (!role) {
    return (
      <main className="team-page" id="main">
        <div className="empty"><h1>{t.noAccess.title}</h1><p>{t.noAccess.body}</p></div>
      </main>
    );
  }
  const careers = (publicOrigin(await headers()) ?? "") + "/";
  // The tool has no background process: each team page (and its
  // 30-second refresh) sends the emails that are due and the interviews
  // waiting for the calendars (lib/outbox.ts).
  await outbox.flush(db()).catch(error => console.error("outbox", error instanceof Error ? error.name : "error"));
  const recruiter = can(member, "settings");
  return (
    <Toasts>
      <AutoRefresh seconds={30} />
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="team-top">
        <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
        <nav className="team-nav" aria-label={t.shell.nav}>
          <NavLink href="/chest">{t.shell.jobs}</NavLink>
          {recruiter && <NavLink href="/chest/pool">{t.shell.pool}</NavLink>}
          {recruiter && <NavLink href="/chest/reports">{t.shell.reports}</NavLink>}
          {recruiter && <NavLink href="/chest/settings">{t.shell.settings}</NavLink>}
          <a href={careers} target="_blank" rel="noopener">{t.shell.careers}<External /></a>
        </nav>
        <form className="top-search" role="search" action="/chest/search">
          <label className="visually-hidden" htmlFor="top-q">{t.search.label}</label>
          <Search />
          <input id="top-q" name="q" type="search" className="field" placeholder={t.search.placeholder} maxLength={100} />
        </form>
        <span className="me">
          <Avatar name={member.name} photo={member.photo} size={30} />
          <span className="me-text"><span>{member.firstName || member.name}</span><span className="me-role">{t.roles[role]}</span></span>
        </span>
      </header>
      <div className="team-page" id="main">{children}</div>
    </Toasts>
  );
}
