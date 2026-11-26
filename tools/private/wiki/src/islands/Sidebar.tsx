import { useState } from "react";
import { Lock, Plus, Upload } from "../components/icons.tsx";
import { NewPageDialog, type NewPageWords, type PageTarget } from "../components/new-page.tsx";
import { NewSpaceDialog } from "../components/new-space.tsx";
import { PageTree, type TreeNode, type TreeSpace } from "../components/tree.tsx";
import type { Catalogue } from "../i18n/index.ts";

export type SidebarWords = NewPageWords & { shell: Catalogue["shell"]; newSpace: Catalogue["newSpace"]; mine: Catalogue["mine"] };

// The wiki's sidebar on wide screens: every space and the tree of its
// pages (dragged to arrange them), and what editors add from it — a page
// of "My pages" (until it exists), a space, an import. On a narrower
// screen the same tree is the "Pages" section (Contents, below), one tap
// away.
export function Sidebar({ spaces, nodes, path, canWrite, t }: { spaces: TreeSpace[]; nodes: TreeNode[]; path: string; canWrite: boolean; t: SidebarWords }) {
  const [newPage, setNewPage] = useState<PageTarget | null>(null);
  const [newSpace, setNewSpace] = useState(false);
  // The member's own "My pages" (a private space): once made, it is in the
  // tree like any space; until then, the sidebar offers to start it.
  const hasPrivate = spaces.some(s => s.private);
  return (
    <nav id="sidebar" className="sidebar" aria-label={t.shell.tree}>
      {spaces.length > 0 && <h2 className="side-title">{t.shell.spaces}</h2>}
      <PageTree spaces={spaces} nodes={nodes} path={path} t={t} onNewPage={setNewPage} />
      {(canWrite || !hasPrivate) && (
        <div className={spaces.length > 0 ? "side-foot" : "side-foot alone"}>
          {!hasPrivate && <button type="button" className="side-link" onClick={() => setNewPage({ spaceId: "mine", spaceName: t.mine.name, parentId: null, parentTitle: null })}><Lock />{t.mine.new}</button>}
          {canWrite && <button type="button" className="side-link" onClick={() => setNewSpace(true)}><Plus />{t.shell.newSpace}</button>}
          {canWrite && <a className="side-link" href="/chest/import" aria-current={path === "/chest/import" ? "page" : undefined}><Upload />{t.shell.import}</a>}
        </div>
      )}
      <NewPageDialog target={newPage} onClose={() => setNewPage(null)} t={t} />
      <NewSpaceDialog open={newSpace} onClose={() => setNewSpace(false)} t={t} />
    </nav>
  );
}

// "Pages": the tree of every space, open, with what editors add from it —
// the sidebar of wide screens, for every screen (on a phone it is the way
// to the pages, a labelled tab away, never a hidden drawer).
export function Contents({ spaces, nodes, path, canWrite, t }: { spaces: TreeSpace[]; nodes: TreeNode[]; path: string; canWrite: boolean; t: SidebarWords }) {
  const [newPage, setNewPage] = useState<PageTarget | null>(null);
  const [newSpace, setNewSpace] = useState(false);
  return (
    <>
      <nav className="contents-tree" aria-label={t.shell.tree}>
        {spaces.length === 0 ? <p className="side-empty">{t.shell.noPages}</p> : <PageTree spaces={spaces} nodes={nodes} path={path} t={t} onNewPage={setNewPage} openAll />}
      </nav>
      {canWrite && (
        <div className="row-actions contents-foot">
          <button type="button" className="button quiet" onClick={() => setNewSpace(true)}><Plus />{t.shell.newSpace}</button>
          <a className="button quiet" href="/chest/import"><Upload />{t.shell.import}</a>
        </div>
      )}
      <NewPageDialog target={newPage} onClose={() => setNewPage(null)} t={t} />
      <NewSpaceDialog open={newSpace} onClose={() => setNewSpace(false)} t={t} />
    </>
  );
}
