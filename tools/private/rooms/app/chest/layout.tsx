import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Building, Desk, Door, People, Week } from "../../components/icons.tsx";
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
        <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
        {role && (
          <nav className="tabs" aria-label={t.shell.nav}>
            <NavLink href="/chest" exact><Week /><span className="label">{t.shell.week}</span></NavLink>
            <NavLink href="/chest/desks"><Desk /><span className="label">{t.shell.desks}</span></NavLink>
            <NavLink href="/chest/rooms"><Door /><span className="label">{t.shell.rooms}</span></NavLink>
            <NavLink href="/chest/people"><People /><span className="label">{t.shell.people}</span></NavLink>
            {can(member, "places.manage") && <NavLink href="/chest/places"><Building /><span className="label">{t.shell.places}</span></NavLink>}
          </nav>
        )}
        <span className="me">
          <span className="who">{member.firstName || member.name}{role ? " · " + t.roles[role] : ""}</span>
          <Avatar name={member.name} photo={member.photo} />
        </span>
      </header>
      <div id="main">
        {role ? children : (
          <main className="narrow">
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
