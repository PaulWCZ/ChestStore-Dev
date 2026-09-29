import { BrandMark, NoAccess, Toasts, type NavItem } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Contours } from "../../components/contours.tsx";
import { Calendar, Compass, Flag, Gear, People } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell (skip link, the map's dark header,
// the sections as labelled tabs, member chip) and its toasts. proxy.ts
// already refused a request without the Chest's assertion; a member whose
// role gives nothing sees why, not an error. In brand mode the company's
// logo stands where Goals' mark is, on the kit's normal header (the dark
// band is the Trail map's own: app/tokens.css).
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  // An objective, and the import, belong to "Company".
  const nav: NavItem[] = role
    ? [
        { href: "/chest", label: t.shell.myGoals, icon: <Flag />, match: "exact" },
        { href: "/chest/company", label: t.shell.company, icon: <Compass />, also: ["/chest/objectives", "/chest/import"] },
        { href: "/chest/teams", label: t.shell.teams, icon: <People /> },
        { href: "/chest/cycles", label: t.shell.cycles, icon: <Calendar /> },
        ...(can(member, "settings.manage") ? [{ href: "/chest/settings", label: t.shell.settings, icon: <Gear /> }] : []),
      ]
    : [];
  return (
    <Toasts labels={t.toast}>
      <Shell
        brand={<><Contours /><a href="/chest"><BrandMark logo={look.logo} ground={look.source === "own" ? "dark" : "light"}><Mark /></BrandMark><span className="brand-name">{t.meta.name}</span></a></>}
        nav={nav}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      >
        {role ? children : <div className="narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </Shell>
    </Toasts>
  );
}
