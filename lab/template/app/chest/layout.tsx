import { AppShell, BrandMark, NoAccess } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Mark } from "../../components/mark.tsx";
import { roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell (skip link, header, member chip;
// a tool with several sections passes `nav` and the current path through
// a small client component of its own — ui/README.md "AppShell").
// proxy.ts already refused a request without the Chest's assertion; a
// member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  return (
    <AppShell
      brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark>{t.meta.name}</a>}
      member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
      labels={{ skip: t.shell.skip, nav: t.shell.main }}
      width="narrow"
    >
      {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
    </AppShell>
  );
}
