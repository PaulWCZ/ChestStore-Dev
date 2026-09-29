"use client";

import { useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { movePage } from "../app/chest/actions.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { Chevron, Plus } from "./icons.tsx";
import type { PageTarget } from "./new-page.tsx";

// private: the member's own "My pages" (only they see it).
export type TreeSpace = { id: string; name: string; color: string; access: "read" | "write"; private?: boolean };
export type TreeNode = { id: string; spaceId: string; parentId: string | null; title: string };
export type TreeWords = { shell: Catalogue["shell"]; errors: Catalogue["errors"] };

type Drop = { id: string; zone: "before" | "after" | "inside" } | { space: string } | null;

// Every space the reader sees and the tree of its pages: in the sidebar
// (wide screens) and on the "Pages" page (every screen). Editors drag a
// page to arrange it — above a row puts it before, below after, on its
// middle inside — or use "Move" on the page (keyboard, phone). The current
// page's branch opens by itself.
export function PageTree({ spaces, nodes, path, t, onNewPage, openAll = false }: { spaces: TreeSpace[]; nodes: TreeNode[]; path: string; t: TreeWords; onNewPage: (target: PageTarget) => void; openAll?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const below = useMemo(() => {
    const map = new Map<string, TreeNode[]>();
    for (const n of nodes) {
      const key = `${n.spaceId}:${n.parentId ?? ""}`;
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return map;
  }, [nodes]);
  const kids = (spaceId: string, parentId: string | null) => below.get(`${spaceId}:${parentId ?? ""}`) ?? [];

  const currentPage = /^\/chest\/pages\/(\d+)/u.exec(path)?.[1] ?? null;
  const currentSpace = /^\/chest\/spaces\/(\d+)/u.exec(path)?.[1] ?? (currentPage ? byId.get(currentPage)?.spaceId : undefined) ?? null;

  // Open: the current page's branch, remembered as one moves around (all
  // of them on the "Pages" page).
  const [open, setOpen] = useState<Set<string>>(() => new Set(openAll ? nodes.map(n => n.id) : []));
  useEffect(() => {
    if (!currentPage) return;
    setOpen(previous => {
      const next = new Set(previous);
      for (let n = byId.get(currentPage); n; n = n.parentId ? byId.get(n.parentId) : undefined) next.add(n.id);
      return next;
    });
  }, [currentPage, byId]);
  const toggle = (id: string) => setOpen(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // Never into itself or its own pages.
  const inside = (id: string, ancestor: string): boolean => {
    for (let n = byId.get(id); n; n = n.parentId ? byId.get(n.parentId) : undefined) if (n.id === ancestor) return true;
    return false;
  };
  function over(e: DragEvent, id: string) {
    if (!dragged || inside(id, dragged)) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - box.top) / box.height;
    setDrop({ id, zone: y < 0.28 ? "before" : y > 0.72 ? "after" : "inside" });
  }
  // One toast per page moved; its Undo puts the page back where it was
  // and says whether it could.
  async function place(pageId: string, target: { spaceId: string; parentId: string | null; index: number | null }, back: { spaceId: string; parentId: string | null; index: number }) {
    const result = await movePage(pageId, target);
    if (!result.ok) return void toast({ text: format(t.errors[result.error], result.values), tone: "error" });
    router.refresh();
    toast({
      id: `move-${pageId}`,
      text: t.shell.moved,
      undo: async () => {
        const undone = await movePage(pageId, back);
        if (!undone.ok) return format(t.errors[undone.error], undone.values);
        router.refresh();
        return true;
      },
    });
  }
  function dropped(e: DragEvent) {
    e.preventDefault();
    const moving = dragged ? byId.get(dragged) : undefined;
    const at = drop;
    setDragged(null);
    setDrop(null);
    if (!moving || !at) return;
    const from = { spaceId: moving.spaceId, parentId: moving.parentId, index: kids(moving.spaceId, moving.parentId).findIndex(n => n.id === moving.id) };
    if ("space" in at) return void place(moving.id, { spaceId: at.space, parentId: null, index: null }, from);
    const target = byId.get(at.id);
    if (!target || target.id === moving.id) return;
    if (at.zone === "inside") {
      setOpen(previous => new Set(previous).add(target.id));
      return void place(moving.id, { spaceId: target.spaceId, parentId: target.id, index: null }, from);
    }
    const siblings = kids(target.spaceId, target.parentId).filter(n => n.id !== moving.id);
    const index = siblings.findIndex(n => n.id === target.id) + (at.zone === "after" ? 1 : 0);
    void place(moving.id, { spaceId: target.spaceId, parentId: target.parentId, index }, from);
  }

  const branch = (space: TreeSpace, parentId: string | null, depth: number): ReactNode => {
    const list = kids(space.id, parentId);
    if (list.length === 0) return null;
    return (
      <ul className="tree">
        {list.map(n => {
          const has = kids(space.id, n.id).length > 0;
          const shown = open.has(n.id);
          const zone = drop && "id" in drop && drop.id === n.id ? drop.zone : null;
          return (
            <li key={n.id}>
              <div
                className={`row depth-${Math.min(depth, 6)}${n.id === currentPage ? " current" : ""}${zone ? " drop-" + zone : ""}${dragged === n.id ? " dragging" : ""}`}
                draggable={space.access === "write"}
                onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", n.title); setDragged(n.id); }}
                onDragEnd={() => { setDragged(null); setDrop(null); }}
                onDragOver={e => over(e, n.id)}
                onDragLeave={() => setDrop(d => (d && "id" in d && d.id === n.id ? null : d))}
                onDrop={dropped}
              >
                {has ? (
                  <button type="button" className={`twist${shown ? " open" : ""}`} aria-expanded={shown} onClick={() => toggle(n.id)}>
                    <Chevron /><span className="visually-hidden">{format(shown ? t.shell.collapse : t.shell.expand, { title: n.title })}</span>
                  </button>
                ) : <span className="twist" aria-hidden="true" />}
                <Link href={`/chest/pages/${n.id}`} aria-current={n.id === currentPage ? "page" : undefined} draggable={false}>{n.title}</Link>
                {space.access === "write" && (
                  <button type="button" className="add" onClick={() => onNewPage({ spaceId: space.id, spaceName: space.name, parentId: n.id, parentTitle: n.title })}>
                    <Plus /><span className="visually-hidden">{t.shell.newSubpage} — {n.title}</span>
                  </button>
                )}
              </div>
              {has && shown && branch(space, n.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <>
      {spaces.map(space => {
        const target = drop && "space" in drop && drop.space === space.id;
        const here = space.id === currentSpace && !currentPage;
        return (
          <section key={space.id} className={`side-space color-${space.color}`}>
            <div
              className={`space-row${here ? " current" : ""}${target ? " drop-inside" : ""}`}
              onDragOver={e => { if (dragged && space.access === "write") { e.preventDefault(); setDrop({ space: space.id }); } }}
              onDrop={dropped}
            >
              <span className="dot" aria-hidden="true" />
              <Link href={`/chest/spaces/${space.id}`} aria-current={here ? "page" : undefined}>{space.name}</Link>
              {space.access === "write" && (
                <button type="button" className="add" onClick={() => onNewPage({ spaceId: space.id, spaceName: space.name, parentId: null, parentTitle: null })}>
                  <Plus /><span className="visually-hidden">{t.shell.newPage} — {space.name}</span>
                </button>
              )}
            </div>
            {branch(space, null, 0) ?? <p className="side-empty">{t.shell.noPages}</p>}
          </section>
        );
      })}
    </>
  );
}
