import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { sidebarProps } from "../frame.tsx";
import { db } from "../lib/db.ts";
import { tree } from "../lib/pages.ts";
import { listSpaces } from "../lib/spaces.ts";

// "Pages": every space and the tree of its pages, on a page of its own —
// the sidebar of wide screens, for every screen (on a phone it is the way
// to the pages, a labelled tab away, never a hidden drawer).
export async function pagesPage(p: PageContext<MemberContext>): Promise<View> {
  const sql = db();
  const spaces = await listSpaces(sql, p.member);
  const nodes = await tree(sql, p.member, spaces.map(s => s.id));
  return {
    title: p.t.shell.pages,
    body: (
      <div className="page narrow contents-page">
        <h1>{p.t.shell.pages}</h1>
        <Island name="Contents" props={sidebarProps(p, spaces, nodes, p.url.pathname, { all: true })} />
      </div>
    ),
  };
}
