"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Plus, Upload } from "../../../components/icons.tsx";
import { NewPageDialog, type NewPageWords, type PageTarget } from "../../../components/new-page.tsx";
import { NewSpaceDialog } from "../../../components/new-space.tsx";
import { PageTree, type TreeNode, type TreeSpace } from "../../../components/tree.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";

type Words = NewPageWords & { shell: Catalogue["shell"]; newSpace: Catalogue["newSpace"]; dialog: Catalogue["dialog"] };

// The tree of every space, open, with what editors add from it.
export function Contents({ spaces, nodes, canWrite, t }: { spaces: TreeSpace[]; nodes: TreeNode[]; canWrite: boolean; t: Words }) {
  const path = usePathname();
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
          <Link className="button quiet" href="/chest/import"><Upload />{t.shell.import}</Link>
        </div>
      )}
      <NewPageDialog target={newPage} onClose={() => setNewPage(null)} t={t} />
      <NewSpaceDialog open={newSpace} onClose={() => setNewSpace(false)} t={t} />
    </>
  );
}
