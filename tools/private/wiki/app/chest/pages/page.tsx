import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { newPageWords } from "../../../lib/i18n/index.ts";
import { tree } from "../../../lib/pages.ts";
import { viewer } from "../../../lib/session.ts";
import { listSpaces } from "../../../lib/spaces.ts";
import { Contents } from "./contents.tsx";

// "Pages": every space and the tree of its pages, on a page of its own —
// the sidebar of wide screens, for every screen (on a phone it is the way
// to the pages, a labelled tab away, never a hidden drawer).
export default async function PagesPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const sql = db();
  const spaces = await listSpaces(sql, member);
  const nodes = await tree(sql, member, spaces.map(s => s.id));
  return (
    <div className="page narrow contents-page">
      <h1>{t.shell.pages}</h1>
      <Contents
        spaces={spaces.map(s => ({ id: s.id, name: s.name, color: s.color, access: s.access === "write" ? "write" : "read" }))}
        nodes={nodes.map(n => ({ id: n.id, spaceId: n.spaceId, parentId: n.parentId, title: n.title }))}
        canWrite={can(member, "write")}
        t={{ ...newPageWords(t), shell: t.shell, newSpace: t.newSpace, dialog: t.dialog }}
      />
    </div>
  );
}
