import * as chest from "@argentic/chest-sdk/chest";
import { BrandMark, NoAccess, Toasts } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { overdueCount } from "../../lib/documents.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell. proxy.ts already refused a request
// without the Chest's assertion; a member whose role gives nothing sees
// why, not an error. In brand mode the company's logo stands where the
// Quotes mark does. The toasts (the kit's: an Undo that tells the truth)
// serve every page.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const overdue = role ? await overdueCount(db(), chest.today()) : 0;
  const s = t.shell;
  return (
    <Toasts labels={t.toast}>
      <Shell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.meta.name}</span></a>}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        words={{ desk: s.desk, quotes: s.quotes, invoices: s.invoices, clients: s.clients, catalogue: s.catalogue, more: s.more, export: s.export, settings: s.settings, bank: s.bank, importInvoices: s.importInvoices }}
        sections={role !== null}
        overdue={overdue}
        canExport={role !== null && can(member, "export")}
        canBank={role !== null && can(member, "payments")}
        canImportInvoices={role !== null && can(member, "invoices.issue")}
        labels={{ skip: s.skip, nav: s.nav }}
      >
        {role ? children : <div className="page narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </Shell>
    </Toasts>
  );
}
