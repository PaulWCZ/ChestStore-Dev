import { BrandMark, NoAccess, SearchBox, Toasts, type NavItem } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Gauge, People, Person, Shelves } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell: the steel bar (the tool's mark, or
// the company's logo in brand mode; the sections as labelled tabs; the
// search; the member). proxy.ts already refused a request without the
// Chest's assertion; a member whose role gives nothing sees why, not an
// error. Managers find the overview first; members, their own equipment.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const manager = can(member, "items.manage");
  // The bar is dark in both modes (the steel shelf): a brand's logo takes
  // its variant for a dark ground.
  const brand = <a href="/chest"><BrandMark logo={look.logo} ground="dark"><Mark /></BrandMark><span>{t.meta.name}</span></a>;
  const labels = { skip: t.shell.skip, nav: t.shell.nav };
  if (!role) {
    return (
      <Shell brand={brand} labels={labels} member={{ name: member.name, role: null, photo: member.photo }} width="full">
        <div className="narrow">
          <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />
        </div>
      </Shell>
    );
  }
  const nav: NavItem[] = manager
    ? [
      { href: "/chest", label: t.shell.overview, icon: <Gauge />, match: "exact" },
      { href: "/chest/items", label: t.shell.items, icon: <Shelves />, also: ["/chest/labels", "/chest/import", "/chest/inventory", "/chest/settings"] },
      { href: "/chest/people", label: t.shell.people, icon: <People /> },
      { href: "/chest/mine", label: t.shell.mine, icon: <Person /> },
    ]
    : [
      { href: "/chest", label: t.shell.mine, icon: <Person />, match: "exact", also: ["/chest/mine", "/chest/people"] },
      { href: "/chest/items", label: t.shell.items, icon: <Shelves /> },
    ];
  return (
    <Shell
      brand={brand}
      nav={nav}
      tools={<SearchBox action="/chest/items" labels={t.search} maxLength={100} />}
      member={{ name: member.name, role: t.roles[role], photo: member.photo }}
      labels={labels}
      width="full"
    >
      <Toasts labels={t.toast}>{children}</Toasts>
    </Shell>
  );
}
