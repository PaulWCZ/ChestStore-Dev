import { BrandMark, NoAccess, Toasts } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Calendar, Gear, Inbox, People, Sun } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { waiting } from "../../lib/requests.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell (skip link, header, the sections
// as labelled tabs, member chip) and its toasts. proxy.ts already refused a
// request without the Chest's assertion; a member whose role gives nothing
// sees why, not an error. In brand mode the company's logo stands where
// the Leave mark is.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const open = can(member, "approve") ? (await waiting(db(), member).catch(() => [])).length : 0;
  const nav = role
    ? [
        { href: "/chest", label: t.shell.home, icon: <Sun />, exact: true },
        { href: "/chest/calendar", label: t.shell.calendar, icon: <Calendar /> },
        ...(can(member, "approve") ? [{ href: "/chest/approvals", label: t.shell.approvals, icon: <Inbox />, count: open }] : []),
        ...(can(member, "people.team") ? [{ href: "/chest/people", label: t.shell.people, icon: <People /> }] : []),
        ...(can(member, "settings") ? [{ href: "/chest/settings", label: t.shell.settings, icon: <Gear /> }] : []),
      ]
    : [];
  return (
    <Toasts labels={t.toast}>
      <Shell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span className="brand-name">{t.meta.name}</span></a>}
        nav={nav}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      >
        {role ? children : <div className="page narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </Shell>
    </Toasts>
  );
}
