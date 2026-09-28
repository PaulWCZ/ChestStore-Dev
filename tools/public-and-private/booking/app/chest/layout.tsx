import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Calendar, Clock, Gear, Stack } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const hosts = can(member, "host");
  return (
    <>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="bar">
        <a className="brand" href="/chest"><Mark />{t.meta.name}</a>
        {role && (
          <nav className="nav" aria-label={t.shell.nav}>
            <NavLink href="/chest"><Calendar />{t.shell.bookings}</NavLink>
            {hosts && <NavLink href="/chest/types"><Stack />{t.shell.types}</NavLink>}
            {hosts && <NavLink href="/chest/hours"><Clock />{t.shell.hours}</NavLink>}
            <NavLink href="/chest/settings"><Gear />{t.shell.settings}</NavLink>
          </nav>
        )}
        <span className="who">
          <span>{member.firstName || member.name}{role ? " · " + t.roles[role] : ""}</span>
          <Avatar name={member.name} photo={member.photo} />
        </span>
      </header>
      <main id="main" className="page">
        {role ? children : (
          <div className="empty">
            <h1>{t.noAccess.title}</h1>
            <p>{t.noAccess.body}</p>
          </div>
        )}
      </main>
    </>
  );
}
