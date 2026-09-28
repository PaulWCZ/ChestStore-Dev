import type { ReactNode } from "react";
import { Shell } from "../../components/shell.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import { newPageWords } from "../../lib/i18n/index.ts";
import { tree } from "../../lib/pages.ts";
import { viewer } from "../../lib/session.ts";
import { listSpaces } from "../../lib/spaces.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error.
// Every page gets the spaces and the titles of their pages for the sidebar
// (titles only: a company's wiki is a few thousand pages at most).
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  if (!role) {
    return (
      <main className="page narrow">
        <div className="empty">
          <h1>{t.noAccess.title}</h1>
          <p>{t.noAccess.body}</p>
        </div>
      </main>
    );
  }
  const sql = db();
  const spaces = await listSpaces(sql, member);
  const nodes = await tree(sql, member, spaces.map(s => s.id));
  return (
    <Toasts>
      <Shell
        spaces={spaces.map(s => ({ id: s.id, name: s.name, color: s.color, access: s.access === "write" ? "write" : "read" }))}
        nodes={nodes.map(n => ({ id: n.id, spaceId: n.spaceId, parentId: n.parentId, title: n.title }))}
        canWrite={can(member, "write")}
        me={{ name: member.name, first: member.firstName || member.name, photo: member.photo, role: t.roles[role] }}
        t={{ ...newPageWords(t), shell: t.shell, newSpace: t.newSpace, undo: t.page.undo, name: t.meta.name }}
      >
        {children}
      </Shell>
    </Toasts>
  );
}
