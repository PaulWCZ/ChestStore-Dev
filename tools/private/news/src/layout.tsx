import { AppShell, BrandMark, NoAccess } from "@argentic/chest-ui/components";
import type { Look } from "@argentic/chest-ui/runtime";
import type { ReactNode } from "react";
import { Pen } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { Island } from "./core/island.tsx";
import type { MemberContext, VisitorContext } from "./core/tool.ts";
import { can, roleOf } from "./lib/access.ts";

// What goes around every page. For members, the kit's AppShell: the mark
// (the company's logo in brand mode), the search at the right of the
// header ("/" focuses it) and, for a publisher, "Write a post" — for
// everyone else with a role, "Share something" (a post a publisher
// approves). News has one page people read, so no sections: the front
// page's own section tabs filter it. The header's search is left out on
// the search page (which has its own), and the Write button inside the
// composer (where the only button that sends is the composer's own). A
// member whose role gives nothing sees why, not an error.
//
// The toasts sit outside the page's main region, under an id: a page met
// by navigate() (src/core/client.tsx) keeps them, and a toast's Undo with
// them — the Undo of an Important post follows its author from the
// composer to the article.
type Props<V> = { viewer: V; look: Look; path: string; notice: string | null; children: ReactNode };

const composing = (path: string) => path === "/chest/new" || path === "/chest/propose" || /^\/chest\/posts\/[^/]+\/edit$/u.test(path);

export function MembersLayout({ viewer: { member, t }, look, path, notice, children }: Props<MemberContext>) {
  const role = roleOf(member);
  const write = can(member, "publish") ? { label: t.shell.write, href: "/chest/new" } : role ? { label: t.shell.propose, href: "/chest/propose" } : null;
  const tools = (
    <>
      {role && path !== "/chest/search" && <Island name="Search" props={{ id: "top-search", labels: t.searchBox }} />}
      {write && !composing(path) && <a className="button small write" href={write.href}><Pen /><span>{write.label}</span></a>}
    </>
  );
  return (
    <>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.tool.name}</span></a>}
        path={path}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        tools={tools}
        labels={{ skip: t.shell.skip, nav: t.shell.sections }}
        width="full"
      >
        {notice && <p className="notice" role="alert">{notice}</p>}
        {role ? children : <div className="narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </AppShell>
      <div id="toasts">
        <Island name="ToastHost" props={{ labels: t.toast, unavailable: t.errors.unavailable }} />
        <Island name="Ready" props={{}} />
      </div>
    </>
  );
}

// The host's root, outside the Chest's members' part: News has no public
// part (a Chest answers 404 there); reached without a Chest, it says where
// News lives.
export function PublicLayout({ viewer: { t }, notice, children }: Props<VisitorContext>) {
  return (
    <>
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <main id="main" className="page public" tabIndex={-1}>
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
      </main>
      <div id="toasts">
        <Island name="ToastHost" props={{ labels: t.toast, unavailable: t.errors.unavailable }} />
        <Island name="Ready" props={{}} />
      </div>
    </>
  );
}
