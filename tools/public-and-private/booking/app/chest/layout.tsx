import { BrandMark, NoAccess } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell (skip link, header, labelled tabs,
// member chip). In brand mode the company's logo stands where the tool's
// mark is. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const hosts = can(member, "host");
  const sections = !role ? [] : [
    { id: "bookings" as const, label: t.shell.bookings },
    ...(hosts ? [{ id: "types" as const, label: t.shell.types }, { id: "hours" as const, label: t.shell.hours }] : []),
    { id: "settings" as const, label: t.shell.settings },
  ];
  return (
    <Shell
      brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark>{t.meta.name}</a>}
      sections={sections}
      labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
    >
      {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
    </Shell>
  );
}
