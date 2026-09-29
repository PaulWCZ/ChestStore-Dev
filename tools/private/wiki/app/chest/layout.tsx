import { BrandMark, NoAccess, Toasts } from "@argentic/chest-ui/components";
import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "../../components/mark.tsx";
import { Shell } from "../../components/shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { newPageWords } from "../../lib/i18n/index.ts";
import { tree } from "../../lib/pages.ts";
import { viewer } from "../../lib/session.ts";
import { listSpaces } from "../../lib/spaces.ts";
import { currentLook } from "../../lib/theme.ts";

// The members' part, in the kit's shell (components/shell.tsx) inside the
// kit's toasts. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error.
// Every page gets the spaces and the titles of their pages for the sidebar
// (titles only: a company's wiki is a few thousand pages at most). In brand
// mode the company's logo stands where the wiki's mark does.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const brand = <Link href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span className="brand-name">{t.meta.name}</span></Link>;
  const chip = { name: member.name, role: role ? t.roles[role] : null, photo: member.photo };
  const sql = db();
  const spaces = role ? await listSpaces(sql, member) : [];
  const nodes = role ? await tree(sql, member, spaces.map(s => s.id)) : [];
  return (
    <Toasts labels={t.toast}>
      <Shell
        brand={brand}
        member={chip}
        spaces={spaces.map(s => ({ id: s.id, name: s.name, color: s.color, access: s.access === "write" ? "write" : "read", private: s.visibility === "private" }))}
        nodes={nodes.map(n => ({ id: n.id, spaceId: n.spaceId, parentId: n.parentId, title: n.title }))}
        canWrite={role !== null && can(member, "write")}
        noAccess={role === null}
        t={{ ...newPageWords(t), shell: t.shell, newSpace: t.newSpace, mine: t.mine, searchBox: t.searchBox }}
      >
        {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
      </Shell>
    </Toasts>
  );
}
