"use client";

import { AppShell, SearchBox, type NavItem } from "@argentic/chest-ui/components";
import type { SearchWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Catalogue } from "../lib/i18n/index.ts";
import { Book, Home, Lock, Plus, Search, Trash, Upload } from "./icons.tsx";
import { NewPageDialog, type NewPageWords, type PageTarget } from "./new-page.tsx";
import { NewSpaceDialog } from "./new-space.tsx";
import { PageTree, type TreeNode, type TreeSpace } from "./tree.tsx";

export type ShellWords = NewPageWords & {
  shell: Catalogue["shell"];
  newSpace: Catalogue["newSpace"];
  mine: Catalogue["mine"];
  searchBox: SearchWords;
  dialog: Catalogue["dialog"];
};

// The frame of every page of /chest: the kit's shell (skip link, header,
// the sections as labelled tabs — a row of their own under the header on a
// phone, never behind a menu — and the member chip), a search box in the
// header of wide screens, and the wiki's sidebar: every space and its tree
// of pages. The sidebar is for wide screens; on a narrower one the same
// tree is the "Pages" section (/chest/pages), one tap away. While a page is
// being edited, the sidebar and the search box step aside.
export function Shell({ brand, member, spaces, nodes, canWrite, noAccess = false, t, children }: {
  brand: ReactNode;
  // The member's role gives nothing: the shell and the kit's NoAccess only.
  noAccess?: boolean;
  member: { name: string; role: string | null; photo: string | null };
  spaces: TreeSpace[];
  nodes: TreeNode[];
  canWrite: boolean;
  t: ShellWords;
  children: ReactNode;
}) {
  const path = usePathname();
  const [newPage, setNewPage] = useState<PageTarget | null>(null);
  const [newSpace, setNewSpace] = useState(false);
  const editing = /^\/chest\/pages\/\d+\/edit/u.test(path);
  const contents = path === "/chest/pages";
  // The member's own "My pages" (a private space): once made, it is in the
  // tree like any space; until then, the sidebar offers to start it.
  const hasPrivate = spaces.some(s => s.private);

  const nav: NavItem[] = noAccess ? [] : [
    { href: "/chest", label: t.shell.home, icon: <Home />, exact: true },
    // A space is a part of "Pages" (its first page, in a way): the tab
    // says so there too.
    { href: "/chest/pages", label: t.shell.pages, icon: <Book />, also: ["/chest/spaces"] },
    { href: "/chest/search", label: t.shell.searchShort, icon: <Search /> },
    // A reader's trash holds their own private pages.
    ...(canWrite || hasPrivate ? [{ href: "/chest/trash", label: t.shell.trash, icon: <Trash /> }] : []),
  ];

  return (
    <AppShell
      brand={brand}
      nav={nav}
      path={path}
      link={Link}
      member={member}
      tools={editing || noAccess ? null : <div className="bar-search"><SearchBox action="/chest/search" labels={t.searchBox} placeholder={t.shell.search} maxLength={100} /></div>}
      labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      width="full"
    >
      {noAccess ? <div className="page narrow">{children}</div> : <div className={`frame${editing ? " editing" : ""}`}>
        {/* No space to list and none to make (a reader of an empty wiki):
            no sidebar, the page takes the width. */}
        {!editing && !contents && (spaces.length > 0 || canWrite) && (
          <nav id="sidebar" className="sidebar" aria-label={t.shell.tree}>
            {spaces.length > 0 && <h2 className="side-title">{t.shell.spaces}</h2>}
            <PageTree spaces={spaces} nodes={nodes} path={path} t={t} onNewPage={setNewPage} />
            {(canWrite || !hasPrivate) && (
              <div className={spaces.length > 0 ? "side-foot" : "side-foot alone"}>
                {!hasPrivate && <button type="button" className="side-link" onClick={() => setNewPage({ spaceId: "mine", spaceName: t.mine.name, parentId: null, parentTitle: null })}><Lock />{t.mine.new}</button>}
                {canWrite && <button type="button" className="side-link" onClick={() => setNewSpace(true)}><Plus />{t.shell.newSpace}</button>}
                {canWrite && <Link className="side-link" href="/chest/import" aria-current={path === "/chest/import" ? "page" : undefined}><Upload />{t.shell.import}</Link>}
              </div>
            )}
          </nav>
        )}
        <div className="content">{children}</div>
      </div>}
      <NewPageDialog target={newPage} onClose={() => setNewPage(null)} t={t} />
      <NewSpaceDialog open={newSpace} onClose={() => setNewSpace(false)} t={t} />
    </AppShell>
  );
}
