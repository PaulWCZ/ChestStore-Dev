import { AppShell, BrandMark, NoAccess, Toasts } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Mark } from "../../components/mark.tsx";
import { roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell (skip link, header, member chip)
// and its toasts. Polls has one place — the home page lists every poll —
// so the header holds no sections; each page's main action sits at the top
// of the page ("New poll" on the home page). proxy.ts already refused a
// request without the Chest's assertion; a member whose role gives nothing
// sees why, not an error. In brand mode the company's logo stands where
// the Polls mark is.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  return (
    <Toasts labels={t.toast}>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.meta.name}</span></a>}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
        width="normal"
      >
        {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
      </AppShell>
    </Toasts>
  );
}
