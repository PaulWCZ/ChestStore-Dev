import * as chest from "@argentic/chest-sdk/chest";
import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { BottomBar } from "../../components/bottom-bar.tsx";
import { Box, Desk, Download, Gear, Invoice, People, Quote } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { overdueCount } from "../../lib/documents.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const overdue = role ? await overdueCount(db(), chest.today()) : 0;
  return (
    <Toasts>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="top">
        <div className="top-inner">
          <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
          {role && (
            <nav className="tabs" aria-label={t.shell.nav}>
              <NavLink href="/chest" exact><Desk />{t.shell.desk}</NavLink>
              <NavLink href="/chest/quotes"><Quote />{t.shell.quotes}</NavLink>
              <NavLink href="/chest/invoices"><Invoice />{t.shell.invoices}{overdue > 0 && <span className="count" aria-label={t.shell.overdueCount.replace("{count}", String(overdue))}>{overdue}</span>}</NavLink>
              <NavLink href="/chest/clients"><People />{t.shell.clients}</NavLink>
              <NavLink href="/chest/catalogue"><Box />{t.shell.catalogue}</NavLink>
            </nav>
          )}
          <span className="me">
            {role && can(member, "export") && <NavLink href="/chest/export" className="icon-link wide-only" label={t.shell.export}><Download /></NavLink>}
            {role && <NavLink href="/chest/settings" className="icon-link wide-only" label={t.shell.settings}><Gear /></NavLink>}
            <span className="who">{member.firstName || member.name}{role ? " · " + t.roles[role] : ""}</span>
            <Avatar name={member.name} photo={member.photo} />
          </span>
        </div>
      </header>
      {role && (
        <BottomBar
          label={t.shell.nav}
          moreLabel={t.shell.more}
          main={[
            { href: "/chest", exact: true, label: t.shell.desk, icon: <Desk /> },
            { href: "/chest/quotes", label: t.shell.quotes, icon: <Quote /> },
            { href: "/chest/invoices", label: t.shell.invoices, icon: <Invoice />, count: { value: overdue, label: t.shell.overdueCount.replace("{count}", String(overdue)) } },
          ]}
          more={[
            { href: "/chest/clients", label: t.shell.clients, icon: <People /> },
            { href: "/chest/catalogue", label: t.shell.catalogue, icon: <Box /> },
            ...(can(member, "export") ? [{ href: "/chest/export", label: t.shell.export, icon: <Download /> }] : []),
            { href: "/chest/settings", label: t.shell.settings, icon: <Gear /> },
          ]}
        />
      )}
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
