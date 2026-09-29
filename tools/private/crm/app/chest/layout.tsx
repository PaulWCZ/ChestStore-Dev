import { BrandMark, NoAccess, Toasts } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell. proxy.ts already refused a request
// without the Chest's assertion; a member whose role gives nothing sees
// why, not an error. In brand mode the company's logo stands where the
// Clients mark does. The toasts (the kit's: an Undo that tells the truth)
// serve every page.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  return (
    <Toasts labels={t.toast}>
      <Shell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.meta.name}</span></a>}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        words={{ myDay: t.shell.myDay, deals: t.shell.deals, companies: t.shell.companies, contacts: t.shell.contacts, team: t.shell.team, more: t.shell.more, import: t.shell.import, settings: t.shell.settings, exportAll: t.shell.exportAll }}
        sections={role !== null}
        more={{ import: role !== null && can(member, "import"), settings: role !== null && can(member, "stages"), exportAll: role !== null && can(member, "export.all") }}
        search={t.searchBox}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      >
        {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
      </Shell>
    </Toasts>
  );
}
