import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Download, Gear, Plus, Receipt, Stamp, Wallet } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { toPay, waiting } from "../../lib/expenses.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const sql = db();
  const approvals = can(member, "approve") ? (await waiting(sql, member)).length : 0;
  const payments = can(member, "pay") ? new Set((await toPay(sql, member)).map(e => e.owner)).size : 0;
  return (
    <Toasts>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="top">
        <div className="top-inner">
          <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
          {role && (
            <nav className="tabs" aria-label={t.shell.nav}>
              <NavLink href="/chest" exact also={["/chest/new", "/chest/expenses"]}><Receipt />{t.shell.mine}</NavLink>
              {can(member, "approve") && <NavLink href="/chest/approve"><Stamp />{t.shell.approve}{approvals > 0 && <span className="count">{approvals}</span>}</NavLink>}
              {can(member, "pay") && <NavLink href="/chest/pay"><Wallet />{t.shell.pay}{payments > 0 && <span className="count">{payments}</span>}</NavLink>}
              {can(member, "export") && <NavLink href="/chest/export"><Download />{t.shell.export}</NavLink>}
              <NavLink href="/chest/settings"><Gear />{t.shell.settings}</NavLink>
            </nav>
          )}
          <span className="me">
            <span className="who">{member.firstName || member.name}{role ? " · " + t.roles[role] : ""}</span>
            <Avatar name={member.name} photo={member.photo} />
          </span>
          {role && <a className="button small add" href="/chest/new"><Plus />{t.shell.add}</a>}
        </div>
      </header>
      <div id="main">
        {role ? children : (
          <main className="page">
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
