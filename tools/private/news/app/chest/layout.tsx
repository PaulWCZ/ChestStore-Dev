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
// News mark does. The toasts (the kit's: an Undo that tells the truth)
// serve every page, and outlive a page change: the Undo of an Important
// post follows its author from the composer to the article.
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
        search={role ? t.searchBox : null}
        write={can(member, "publish") ? t.shell.write : null}
        labels={{ skip: t.shell.skip, nav: t.shell.sections }}
      >
        {role ? children : <div className="narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </Shell>
    </Toasts>
  );
}
