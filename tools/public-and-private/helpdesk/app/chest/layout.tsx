import type { ReactNode } from "react";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Avatar } from "../../components/avatar.tsx";
import { Alert, Check, Clock, Gear, Inbox, Person, Plus } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { viewer } from "../../lib/session.ts";
import { folderCounts } from "../../lib/tickets.ts";

// The team's part: folders on the side (with what waits in each), the page
// beside. proxy.ts refused anyone the Chest did not sign in.
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
  const counts = await folderCounts(db(), member);
  const f = t.inbox.folders;
  return (
    <Toasts>
      <AutoRefresh seconds={20} />
      <a className="skip" href="#main">{t.shell.skip}</a>
      <div className="app">
        <aside className="side">
          <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
          <nav aria-label={t.shell.nav}>
            <NavLink href="/chest?folder=unassigned" match="unassigned"><Inbox />{f.unassigned}<span className="n">{counts.unassigned}</span></NavLink>
            <NavLink href="/chest?folder=mine" match="mine"><Person />{f.mine}<span className="n">{counts.mine}</span></NavLink>
            <NavLink href="/chest?folder=open" match="open"><Alert />{f.open}<span className="n">{counts.open}</span></NavLink>
            <NavLink href="/chest?folder=waiting" match="waiting"><Clock />{f.waiting}<span className="n">{counts.waiting}</span></NavLink>
            <NavLink href="/chest?folder=closed" match="closed"><Check />{f.closed}</NavLink>
            {counts.spam > 0 && <NavLink href="/chest?folder=spam" match="spam"><Alert />{f.spam}<span className="n">{counts.spam}</span></NavLink>}
            <span className="sep" />
            {can(member, "tickets.answer") && <NavLink href="/chest/new"><Plus />{t.shell.new}</NavLink>}
            <NavLink href="/chest/settings"><Gear />{t.shell.settings}</NavLink>
          </nav>
          <span className="me">
            <Avatar name={member.name} photo={member.photo} />
            <span className="who">{member.firstName || member.name} · {t.roles[role]}</span>
          </span>
        </aside>
        <div className="main" id="main">{children}</div>
      </div>
    </Toasts>
  );
}
