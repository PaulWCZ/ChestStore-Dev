import { BrandMark, NoAccess, Toasts, type NavItem } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { CheckList, Clipboard, Folder, People, Tree } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { openCounts } from "../../lib/journeys.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell (skip link, header, the sections
// as labelled tabs, member chip) and its toasts. proxy.ts already refused a
// request without the Chest's assertion; a member whose role gives nothing
// sees why, not an error. In brand mode the company's logo stands where
// People's mark is.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const todo = role ? (await openCounts(db(), [member.id])).get(member.id) ?? 0 : 0;
  // A section is also current on the pages below it that live elsewhere (a
  // profile is the directory's; the numbers are the records').
  const nav: NavItem[] = role
    ? [
        { href: "/chest", label: t.shell.directory, icon: <People />, exact: true, also: ["/chest/people", "/chest/import", "/chest/table"] },
        { href: "/chest/chart", label: t.shell.chart, icon: <Tree /> },
        { href: "/chest/todo", label: t.shell.todo, icon: <CheckList />, ...(todo > 0 ? { count: todo } : {}) },
        ...(can(member, "checklists.manage") ? [{ href: "/chest/checklists", label: t.shell.checklists, icon: <Clipboard /> }] : []),
        ...(can(member, "records.manage") ? [{ href: "/chest/records", label: t.shell.records, icon: <Folder />, also: ["/chest/numbers"] }] : []),
      ]
    : [];
  return (
    <Toasts labels={t.toast}>
      <Shell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span className="brand-name">{t.meta.name}</span></a>}
        nav={nav}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo, href: role ? `/chest/people/${member.id}` : "" }}
        me={t.shell.me}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      >
        {role ? children : <div className="page narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </Shell>
    </Toasts>
  );
}
