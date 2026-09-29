"use client";

import { AppShell, Toasts, useAutoRefresh, type NavItem } from "@argentic/chest-ui/components";
import type { ToastWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Keys, type KeyWords } from "./keys.tsx";

// The team's frame, in the kit's shell: Support's sections as labelled
// tabs (Inbox, Reports, Settings — a row of their own on a phone), who is
// signed in at the right, the toasts, the keyboard shortcuts, and the page
// reading itself again every 20 seconds while it is seen (the Chest has no
// WebSocket).
//
// Beside the page, the inbox's folders and the team's saved views: a
// column on a wide screen (as in every shared inbox: they are where the
// work is), on a phone a row of labelled chips that scrolls sideways,
// above the inbox only — never hidden behind a menu, and never pushing a
// ticket's answer box down. They are the inbox's filters, not sections:
// the one navigation rule's five tabs stay the sections.
export type Folder = { key: string; href: string; label: string; count: number | null; icon: ReactNode };
export type SavedView = { id: string; href: string; name: string };

export function TeamShell({ brand, nav, member, folders, views, labels, toast, keys, canCreate, icons, children }: {
  brand: ReactNode;
  nav: NavItem[];
  member: { name: string; role: string | null; photo: string | null };
  folders: Folder[];
  views: SavedView[];
  labels: { skip: string; nav: string; folders: string; views: string };
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
  return (
    <Toasts labels={toast}>
      <AppShell brand={brand} nav={nav} path={path} link={Link} member={member} labels={labels} width="full">
        <Keys canCreate={canCreate} t={keys} />
        <div className={`desk${inbox ? " on-inbox" : ""}`}>
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
          <div className="desk-main">{children}</div>
        </div>
      </AppShell>
    </Toasts>
  );
}
