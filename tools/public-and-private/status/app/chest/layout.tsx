import { BrandMark, Toasts } from "@argentic/chest-ui/components";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { roleOf } from "../../lib/access.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";
import { TeamStatus } from "./team-status.tsx";

// The members' part, in the kit's shell. proxy.ts already refused a request
// without the Chest's assertion; a member without a role sees the team's
// status page (read only), whatever the address — not an error, and not
// the kit's NoAccess: every member of the company may know what works. In
// brand mode the company's logo stands where the Status mark does. The
// toasts (the kit's: an Undo that tells the truth) serve every page.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, locale, t } = v;
  const role = roleOf(member);
  // Editors see the page as it is now, not a copy their browser kept.
  const publicHome = `${publicOrigin(await headers()) ?? ""}/?fresh=${Math.floor(Date.now() / 1000)}`;
  return (
    <Toasts labels={t.toast}>
      <Shell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.meta.name}</span></a>}
        words={{ now: t.shell.now, history: t.shell.history, components: t.shell.components, checks: t.shell.checks, settings: t.shell.settings, publicPage: t.shell.publicPage }}
        sections={role !== null}
        publicHome={publicHome}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      >
        {role ? children : <TeamStatus locale={locale} t={t} />}
      </Shell>
    </Toasts>
  );
}
