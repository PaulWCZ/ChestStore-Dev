import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { External } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { roleOf } from "../../lib/access.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";
import { TeamStatus } from "./team-status.tsx";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member without a role sees the team's status page (read
// only), whatever the address.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const role = roleOf(member);
  // Editors see the page as it is now, not a copy their browser kept.
  const publicHome = `${publicOrigin(await headers()) ?? ""}/?fresh=${Math.floor(Date.now() / 1000)}`;
  return (
    <Toasts>
      <div className="team">
        <a className="skip" href="#main">{t.shell.skip}</a>
        <header className="top">
          <div className="top-inner">
            <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
            {role && (
              <nav className="tabs" aria-label={t.shell.nav}>
                <NavLink href="/chest" exact>{t.shell.now}</NavLink>
                <NavLink href="/chest/history">{t.shell.history}</NavLink>
                <NavLink href="/chest/components">{t.shell.components}</NavLink>
                <NavLink href="/chest/checks">{t.shell.checks}</NavLink>
                <NavLink href="/chest/subscribers">{t.shell.subscribers}</NavLink>
                <NavLink href="/chest/settings">{t.shell.settings}</NavLink>
              </nav>
            )}
            <span className="me">
              {role && <a className="public-link" href={publicHome} target="_blank" rel="noopener" aria-label={t.shell.publicPage}><span>{t.shell.publicPage}</span><External /></a>}
              <Avatar name={member.name} photo={member.photo} />
            </span>
          </div>
        </header>
        <div id="main" className="team-main">
          {role ? children : <TeamStatus locale={locale} t={t} />}
        </div>
      </div>
    </Toasts>
  );
}
