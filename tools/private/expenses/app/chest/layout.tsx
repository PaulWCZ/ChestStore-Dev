import { BrandMark, NoAccess, SearchBox, Toasts, type NavItem } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Download, Gear, Plus, Receipt, Stamp, Wallet } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { toPay, waiting } from "../../lib/expenses.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell: the tool's mark (or the company's
// logo in brand mode), the sections as labelled tabs with what waits in
// each, the member, and "Add" — the tool's one job — at the right on a
// wide screen (on a phone, the dock of "My expenses" holds it).
// proxy.ts already refused a request without the Chest's assertion; a
// member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const brand = <a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.meta.name}</span></a>;
  const labels = { skip: t.shell.skip, nav: t.shell.nav };
  if (!role) {
    return (
      <Shell brand={brand} member={{ name: member.name, photo: member.photo }} labels={labels}>
        <div className="page">
          <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />
        </div>
      </Shell>
    );
  }
  const sql = db();
  const approvals = can(member, "approve") ? (await waiting(sql, member)).length : 0;
  const payments = can(member, "pay") ? new Set((await toPay(sql, member)).map(e => e.owner)).size : 0;
  const nav: NavItem[] = [
    { href: "/chest", label: t.shell.mine, icon: <Receipt />, exact: true, also: ["/chest/new", "/chest/expenses", "/chest/search"] },
    ...(can(member, "approve") ? [{ href: "/chest/approve", label: t.shell.approve, icon: <Stamp />, count: approvals }] : []),
    ...(can(member, "pay") ? [{ href: "/chest/pay", label: t.shell.pay, icon: <Wallet />, count: payments, also: ["/chest/cards"] }] : []),
    ...(can(member, "export") ? [{ href: "/chest/export", label: t.shell.export, icon: <Download /> }] : []),
    { href: "/chest/settings", label: t.shell.settings, icon: <Gear /> },
  ];
  return (
    <Shell
      brand={brand}
      nav={nav}
      member={{ name: member.name, role: t.roles[role], photo: member.photo }}
      tools={<><SearchBox action="/chest/search" labels={t.search} maxLength={100} className="top-search" /><a className="button small top-add" href="/chest/new"><Plus />{t.shell.add}</a></>}
      labels={labels}
      width="full"
    >
      <Toasts labels={t.toast}>{children}</Toasts>
    </Shell>
  );
}
