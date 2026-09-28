import Link from "next/link";
import type { ReactNode } from "react";
import { Clipboard, CheckList, People, Tree } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Portrait } from "../../components/portrait.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { openCounts } from "../../lib/journeys.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const todo = role ? (await openCounts(db(), [member.id])).get(member.id) ?? 0 : 0;
  return (
    <Toasts>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="top">
        <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
        {role && (
          <nav className="tabs" aria-label={t.shell.nav}>
            <NavLink href="/chest" exact also={["/chest/people", "/chest/import"]}><People /><span className="label">{t.shell.directory}</span></NavLink>
            <NavLink href="/chest/chart"><Tree /><span className="label">{t.shell.chart}</span></NavLink>
            <NavLink href="/chest/todo"><CheckList /><span className="label">{t.shell.todo}</span>{todo > 0 && <span className="count">{todo}</span>}</NavLink>
            {can(member, "checklists.manage") && <NavLink href="/chest/checklists"><Clipboard /><span className="label">{t.shell.checklists}</span></NavLink>}
          </nav>
        )}
        {role ? (
          <Link className="me" href={`/chest/people/${member.id}`} title={t.shell.me}>
            <span className="who">{member.firstName || member.name}<small>{t.roles[role]}</small></span>
            <Portrait name={member.name} photo={member.photo} size={36} />
            <span className="visually-hidden">{t.shell.me}</span>
          </Link>
        ) : (
          <span className="me"><Portrait name={member.name} photo={member.photo} size={36} /></span>
        )}
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
