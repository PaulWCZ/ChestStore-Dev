"use client";

import { AppShell, Toasts, useAutoRefresh, type NavItem } from "@argentic/chest-ui/components";
import type { ToastWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Keys, type KeyWords } from "./keys.tsx";

// The team's frame, in the kit's shell: Support's sections as labelled
// tabs (Inbox, Reports, Settings — a row of their own on a phone), who is
// signed in at the right, the toasts, the keyboard shortcuts, and the page
// reading itself again every 20 seconds while it is seen (the Chest has no
// WebSocket).
//
// Beside the page, the inbox's folders and the team's saved views: a
// column on a wide screen (as in every shared inbox: they are where the
// work is), on a narrow window a row of labelled chips that scrolls
// sideways, and on a phone one choice ("Unassigned (3) ▾") above the
// inbox — the first ticket stays near the top, and a ticket's answer box
// is never pushed down. They are the inbox's filters, not sections:
// the one navigation rule's five tabs stay the sections.
export type Folder = { key: string; href: string; label: string; count: number | null; icon: ReactNode };
export type SavedView = { id: string; href: string; name: string };

export function TeamShell({ brand, nav, member, folders, views, labels, toast, keys, canCreate, icons, children }: {
  brand: ReactNode;
  nav: NavItem[];
  member: { name: string; role: string | null; photo: string | null };
  folders: Folder[];
  views: SavedView[];
  labels: { skip: string; nav: string; folders: string; views: string; otherList: string };
  toast: ToastWords;
  keys: KeyWords;
  canCreate: boolean;
  icons: { view: ReactNode };
  children: ReactNode;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  useAutoRefresh(() => router.refresh(), 20);
  const inbox = path === "/chest";
  // A folder is the page shown when the inbox shows it with no search or
  // filter (the inbox without one is "unassigned"); a view, when the inbox
  // shows exactly its parameters.
  const same = (a: URLSearchParams, b: URLSearchParams) => [...a.keys(), ...b.keys()].every(k => a.get(k) === b.get(k));
  const folderShown = (key: string) => inbox && !params.get("q") && !params.get("tag") && !params.get("priority") && (params.get("folder") ?? "unassigned") === key;
  const viewShown = (href: string) => inbox && same(params, new URLSearchParams(href.split("?")[1] ?? ""));
  // The folder or view the inbox shows, for the phone's choice ("" for a
  // search or a filter of one's own).
  const viewNow = views.find(v => viewShown(v.href));
  const listShown = folders.find(f => folderShown(f.key))?.key ?? (viewNow ? "view:" + viewNow.id : "");
  // On a phone the folders slide sideways: the one shown is brought into view.
  const shown = `${path}?${params.toString()}`;
  useEffect(() => {
    const row = document.querySelector<HTMLElement>(".folders");
    const current = row?.querySelector<HTMLElement>("a[aria-current=page]");
    if (row && current && row.scrollWidth > row.clientWidth) row.scrollLeft = current.offsetLeft - row.clientWidth / 2 + current.offsetWidth / 2;
  }, [shown]);
  return (
    <Toasts labels={toast}>
      <AppShell brand={brand} nav={nav} path={path} link={Link} member={member} labels={labels} width="full">
        <Keys canCreate={canCreate} t={keys} />
        <div className={`desk${inbox ? " on-inbox" : ""}${folders.length === 0 ? " bare" : ""}`}>
          {folders.length > 0 && (
            <nav className="folders" aria-label={labels.folders}>
              <ul>
                {folders.map(f => (
                  <li key={f.key}>
                    <Link href={f.href} aria-current={folderShown(f.key) ? "page" : undefined}>{f.icon}<span className="label">{f.label}</span>{f.count !== null && <span className="n">{f.count}</span>}</Link>
                  </li>
                ))}
              </ul>
              {views.length > 0 && (
                <>
                  <p className="nav-head" id="views-head">{labels.views}</p>
                  <ul aria-labelledby="views-head">
                    {views.map(v => (
                      <li key={v.id}><Link href={v.href} aria-current={viewShown(v.href) ? "page" : undefined}>{icons.view}<span className="label">{v.name}</span></Link></li>
                    ))}
                  </ul>
                </>
              )}
            </nav>
          )}
          <div className="desk-main">
            {/* On a phone the folders are one choice above the inbox, not a
                row of chips that runs off the screen. */}
            {inbox && folders.length > 0 && (
              <div className="folder-select">
                <label className="visually-hidden" htmlFor="folder-select">{labels.folders}</label>
                <select id="folder-select" className="field" value={listShown}
                  onChange={e => { const to = folders.find(f => f.key === e.target.value)?.href ?? views.find(v => "view:" + v.id === e.target.value)?.href; if (to) router.push(to); }}>
                  {listShown === "" && <option value="">{labels.otherList}</option>}
                  {folders.map(f => <option key={f.key} value={f.key}>{f.count !== null ? `${f.label} (${f.count})` : f.label}</option>)}
                  {views.length > 0 && <optgroup label={labels.views}>{views.map(v => <option key={v.id} value={"view:" + v.id}>{v.name}</option>)}</optgroup>}
                </select>
              </div>
            )}
            {children}
          </div>
        </div>
      </AppShell>
    </Toasts>
  );
}
