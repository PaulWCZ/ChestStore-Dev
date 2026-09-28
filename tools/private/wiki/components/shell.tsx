"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { movePage } from "../app/chest/actions.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { Avatar } from "./avatar.tsx";
import { Chevron, Close, Home, Menu as MenuIcon, Plus, Search, Trash, Upload } from "./icons.tsx";
import { Mark } from "./mark.tsx";
import { NewPageDialog, type PageTarget } from "./new-page.tsx";
import { NewSpaceDialog } from "./new-space.tsx";
import { useToast } from "./toast.tsx";

export type ShellSpace = { id: string; name: string; color: string; access: "read" | "write" };
export type ShellNode = { id: string; spaceId: string; parentId: string | null; title: string };
export type ShellWords = {
  shell: Catalogue["shell"];
  common: Catalogue["common"];
  newPage: Catalogue["newPage"];
  newSpace: Catalogue["newSpace"];
  errors: Catalogue["errors"];
  undo: string;
  name: string;
};

type Drop = { id: string; zone: "before" | "after" | "inside" } | { space: string } | null;

// The frame of every page of /chest: the header (the wiki's name, search,
// who you are) and the sidebar — every space and its tree of pages, where
// editors drag pages to arrange them. On a phone the sidebar is a drawer
// behind "Pages". While a page is being edited, the sidebar steps aside.
export function Shell({ spaces, nodes, canWrite, me, t, children }: { spaces: ShellSpace[]; nodes: ShellNode[]; canWrite: boolean; me: { name: string; first: string; photo: string | null; role: string }; t: ShellWords; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [drawer, setDrawer] = useState(false);
  const [newPage, setNewPage] = useState<PageTarget | null>(null);
  const [newSpace, setNewSpace] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const children_ = useMemo(() => {
    const map = new Map<string, ShellNode[]>();
    for (const n of nodes) {
      const key = `${n.spaceId}:${n.parentId ?? ""}`;
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return map;
  }, [nodes]);
  const kids = (spaceId: string, parentId: string | null) => children_.get(`${spaceId}:${parentId ?? ""}`) ?? [];

  const currentPage = /^\/chest\/pages\/(\d+)/u.exec(path)?.[1] ?? null;
  const currentSpace = /^\/chest\/spaces\/(\d+)/u.exec(path)?.[1] ?? (currentPage ? byId.get(currentPage)?.spaceId : undefined) ?? null;
  const editing = /^\/chest\/pages\/\d+\/edit/u.test(path);

  // Open: the current page's branch, remembered as one moves around.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setDrawer(false);
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

  // Dragging a page: above a row puts it before, below after, on its middle
  // inside. Never into itself or its own pages.
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
  async function place(pageId: string, target: { spaceId: string; parentId: string | null; index: number | null }, undo?: { spaceId: string; parentId: string | null; index: number }) {
    const result = await movePage(pageId, target);
    if (!result.ok) return toast(format(t.errors[result.error], result.values));
    router.refresh();
    toast(t.shell.moved, undo ? { label: t.undo, run: () => void place(pageId, undo) } : undefined);
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

  const branch = (space: ShellSpace, parentId: string | null, depth: number): ReactNode => {
    const list = kids(space.id, parentId);
    if (list.length === 0) return null;
    return (
      <ul role={depth === 0 ? undefined : "group"} className="tree">
        {list.map(n => {
          const has = kids(space.id, n.id).length > 0;
          const shown = open.has(n.id);
          const zone = drop && "id" in drop && drop.id === n.id ? drop.zone : null;
          return (
            <li key={n.id}>
              <div
                className={`row${n.id === currentPage ? " current" : ""}${zone ? " drop-" + zone : ""}${dragged === n.id ? " dragging" : ""}`}
                style={{ paddingInlineStart: 6 + depth * 14 }}
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
                  <button type="button" className="add" onClick={() => setNewPage({ spaceId: space.id, spaceName: space.name, parentId: n.id, parentTitle: n.title })}>
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
    <div className={`frame${editing ? " editing" : ""}${drawer ? " drawer-open" : ""}`}>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="top">
        {!editing && (
          <button type="button" className="icon-button drawer-toggle" aria-expanded={drawer} aria-controls="sidebar" onClick={() => setDrawer(d => !d)}>
            {drawer ? <Close /> : <MenuIcon />}<span className="visually-hidden">{drawer ? t.shell.close : t.shell.menu}</span>
          </button>
        )}
        <Link className="brand" href="/chest"><Mark /><span>{t.name}</span></Link>
        {!editing && (
          <form className="search" action="/chest/search" role="search">
            <Search />
            <label htmlFor="q" className="visually-hidden">{t.shell.search}</label>
            <input id="q" name="q" type="search" placeholder={t.shell.search} maxLength={100} />
          </form>
        )}
        <span className="me">
          <span className="who"><span className="first">{me.first}</span><span className="role">{me.role}</span></span>
          <Avatar name={me.name} photo={me.photo} />
        </span>
      </header>
      <div className="body">
        {!editing && (
          <nav id="sidebar" className="sidebar" aria-label={t.shell.nav}>
            <Link className={`side-link${path === "/chest" ? " current" : ""}`} href="/chest" aria-current={path === "/chest" ? "page" : undefined}><Home />{t.shell.home}</Link>
            <h2 className="side-title">{t.shell.spaces}</h2>
            {spaces.map(space => {
              const target = drop && "space" in drop && drop.space === space.id;
              return (
                <section key={space.id} className={`side-space color-${space.color}`}>
                  <div
                    className={`space-row${space.id === currentSpace && !currentPage ? " current" : ""}${target ? " drop-inside" : ""}`}
                    onDragOver={e => { if (dragged && space.access === "write") { e.preventDefault(); setDrop({ space: space.id }); } }}
                    onDrop={dropped}
                  >
                    <span className="dot" aria-hidden="true" />
                    <Link href={`/chest/spaces/${space.id}`} aria-current={space.id === currentSpace && !currentPage ? "page" : undefined}>{space.name}</Link>
                    {space.access === "write" && (
                      <button type="button" className="add" onClick={() => setNewPage({ spaceId: space.id, spaceName: space.name, parentId: null, parentTitle: null })}>
                        <Plus /><span className="visually-hidden">{t.shell.newPage} — {space.name}</span>
                      </button>
                    )}
                  </div>
                  {branch(space, null, 0) ?? <p className="side-empty">{t.shell.noPages}</p>}
                </section>
              );
            })}
            {canWrite && (
              <div className="side-foot">
                <button type="button" className="side-link" onClick={() => setNewSpace(true)}><Plus />{t.shell.newSpace}</button>
                <Link className={`side-link${path === "/chest/import" ? " current" : ""}`} href="/chest/import"><Upload />{t.shell.import}</Link>
                <Link className={`side-link${path === "/chest/trash" ? " current" : ""}`} href="/chest/trash"><Trash />{t.shell.trash}</Link>
              </div>
            )}
          </nav>
        )}
        <div id="main" className="content" tabIndex={-1}>{children}</div>
        {drawer && <button type="button" className="scrim" aria-hidden="true" tabIndex={-1} onClick={() => setDrawer(false)} />}
      </div>
      <NewPageDialog target={newPage} onClose={() => setNewPage(null)} t={t} />
      <NewSpaceDialog open={newSpace} onClose={() => setNewSpace(false)} t={t} />
    </div>
  );
}
