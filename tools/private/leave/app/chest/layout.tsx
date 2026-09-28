import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Calendar, Gear, Inbox, People, Sun } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { waiting } from "../../lib/requests.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error. On a
// phone the tabs sit at the bottom, under the thumb.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const open = can(member, "approve") ? (await waiting(db(), member).catch(() => [])).length : 0;
  return (
    <Toasts>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="top">
        <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
        {role && (
          <nav className="tabs" aria-label={t.shell.nav}>
            <NavLink href="/chest" exact><Sun /><span className="label">{t.shell.home}</span></NavLink>
            <NavLink href="/chest/calendar"><Calendar /><span className="label">{t.shell.calendar}</span></NavLink>
            {can(member, "approve") && (
              <NavLink href="/chest/approvals">
                <Inbox /><span className="label">{t.shell.approvals}</span>
                {open > 0 && <span className="count">{open}</span>}
              </NavLink>
            )}
            {can(member, "people.team") && <NavLink href="/chest/people"><People /><span className="label">{t.shell.people}</span></NavLink>}
            {can(member, "settings") && <NavLink href="/chest/settings"><Gear /><span className="label">{t.shell.settings}</span></NavLink>}
          </nav>
        )}
        <span className="me">
          <span className="who">{member.firstName || member.name}{role ? <span className="role">{t.roles[role]}</span> : null}</span>
          <Avatar name={member.name} photo={member.photo} />
        </span>
      </header>
      <div id="main">
        {role ? children : (
          <main className="page narrow">
            <div className="empty">
              <h1>{t.noAccess.title}</h1>
              <p>{t.noAccess.body}</p>
            </div>
          </main>
        )}
      </div>
    </Toasts>
  );
}
