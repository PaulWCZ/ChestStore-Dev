import { BrandMark, NoAccess, Toasts } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell. proxy.ts already refused a request
// without the Chest's assertion; a member whose role gives nothing sees
// why, not an error. In brand mode the company's logo stands where the
// Tasks mark does. The toasts (the kit's: an Undo that tells the truth)
// serve every page.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  return (
    <Toasts labels={t.toast}>
      <Shell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark>{t.meta.name}</a>}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        nav={role ? { myTasks: t.shell.myTasks, boards: t.shell.boards } : null}
        search={t.searchBox}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      >
        {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
      </Shell>
    </Toasts>
  );
}
