import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Contours } from "../../components/contours.tsx";
import { Calendar, Compass, Flag, Gear, People } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  return (
    <Toasts>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="top">
        <Contours />
        <div className="top-inner">
          <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
          <span className="me">
            <span className="who">{member.firstName || member.name}{role ? " · " + t.roles[role] : ""}</span>
            <Avatar name={member.name} photo={member.photo} />
          </span>
          {role && (
            <nav className="tabs" aria-label={t.shell.nav}>
              <NavLink href="/chest" exact><Flag /><span>{t.shell.myGoals}</span></NavLink>
              <NavLink href="/chest/company" also={["/chest/objectives"]}><Compass /><span>{t.shell.company}</span></NavLink>
              <NavLink href="/chest/teams"><People /><span>{t.shell.teams}</span></NavLink>
              <NavLink href="/chest/cycles"><Calendar /><span>{t.shell.cycles}</span></NavLink>
              {can(member, "settings.manage") && <NavLink href="/chest/settings"><Gear /><span>{t.shell.settings}</span></NavLink>}
            </nav>
          )}
        </div>
      </header>
      <main id="main">
        {role ? children : (
          <div className="narrow">
            <div className="empty">
              <Contours variant="small" />
              <h1>{t.noAccess.title}</h1>
              <p>{t.noAccess.body}</p>
            </div>
          </div>
        )}
      </main>
    </Toasts>
  );
}
