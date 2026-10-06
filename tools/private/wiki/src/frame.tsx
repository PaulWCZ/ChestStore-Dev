import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import type { Member } from "@argentic/chest-sdk/member";
import { NoAccess } from "@argentic/chest-ui/components";
import { newPageWords } from "./i18n/index.ts";
import { can, roleOf } from "./lib/access.ts";
import { db } from "./lib/db.ts";
import { tree } from "./lib/pages.ts";
import { listSpaces } from "./lib/spaces.ts";

// The frame of every page of /chest around the page itself: the wiki's
// sidebar on wide screens — every space and its tree of pages (titles
// only: a company's wiki is a few thousand pages at most) — then the
// page. While a page is being edited the sidebar steps aside, and on the
// "Pages" page the tree is the page. A reader of an empty wiki (no space
// to list, none to make) gets no sidebar. A member whose role gives
// nothing sees why, and the page itself does not run.

// What the layout's sections depend on, found while framing a page, told
// to the layout (View.layout → its data): the Trash tab shows to whoever
// writes, and to a reader whose "My pages" exists (its deleted pages are
// theirs). A page without it (an error page): whoever writes.
export const trashShown = (member: Member, data: { trash?: boolean }): boolean => data.trash ?? can(member, "write");

type Render = (p: PageContext<MemberContext>) => Promise<View | Response> | View | Response;

export const framed = (render: Render): Render => async p => {
  const { member, t } = p;
  if (roleOf(member) === null) return { title: t.noAccess.title, body: <div className="page narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div> };
  const view = await render(p);
  if (view instanceof Response) return view;
  const path = p.url.pathname;
  const editing = /^\/chest\/pages\/\d+\/edit$/u.test(path);
  const contents = path === "/chest/pages";
  const canWrite = can(member, "write");
  const spaces = await listSpaces(db(), member);
  const layout = { trash: canWrite || spaces.some(s => s.visibility === "private") };
  if (editing || contents || (spaces.length === 0 && !canWrite)) return { title: view.title, layout, body: <div className="frame"><div className="content">{view.body}</div></div> };
  const nodes = await tree(db(), member, spaces.map(s => s.id));
  return {
    title: view.title,
    layout,
    body: (
      <div className="frame with-sidebar">
        <Island name="Sidebar" props={sidebarProps(p, spaces, nodes, path)} />
        <div className="content">{view.body}</div>
      </div>
    ),
  };
};

// The tree's data and words, for the sidebar and the "Pages" page.
type Spaces = Awaited<ReturnType<typeof listSpaces>>;
type Nodes = Awaited<ReturnType<typeof tree>>;
export function sidebarProps({ member, t }: MemberContext, spaces: Spaces, nodes: Nodes, path: string) {
  return {
    spaces: spaces.map(s => ({ id: s.id, name: s.name, color: s.color, access: s.access === "write" ? "write" as const : "read" as const, private: s.visibility === "private" })),
    nodes: nodes.map(n => ({ id: n.id, spaceId: n.spaceId, parentId: n.parentId, title: n.title })),
    path,
    canWrite: can(member, "write"),
    t: { ...newPageWords(t), shell: t.shell, newSpace: t.newSpace, mine: t.mine },
  };
}
