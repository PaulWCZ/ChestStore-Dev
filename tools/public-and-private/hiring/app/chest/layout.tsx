import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { Avatar } from "../../components/avatar.tsx";
import { External } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";

// The team's part: the jobs, the careers page's settings, who you are.
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
  return (
    <Toasts>
      <AutoRefresh seconds={30} />
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="team-top">
        <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
        <nav className="team-nav" aria-label={t.shell.nav}>
          <NavLink href="/chest">{t.shell.jobs}</NavLink>
          {can(member, "settings") && <NavLink href="/chest/settings">{t.shell.settings}</NavLink>}
          <a href={careers} target="_blank" rel="noopener">{t.shell.careers}<External /></a>
        </nav>
        <span className="me">
          <Avatar name={member.name} photo={member.photo} size={30} />
          <span className="me-text"><span>{member.firstName || member.name}</span><span className="me-role">{t.roles[role]}</span></span>
        </span>
      </header>
      <div className="team-page" id="main">{children}</div>
    </Toasts>
  );
}
