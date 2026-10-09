import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, NoAccess } from "@argentic/chest-ui/components";
import { Pen } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
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
// by navigate() (@argentic/chest-app/client) keeps them, and a toast's Undo with
// them — the Undo of an Important post follows its author from the
// composer to the article.

const composing = (path: string) => path === "/chest/new" || path === "/chest/propose" || /^\/chest\/posts\/[^/]+\/edit$/u.test(path);

export function MembersLayout({ viewer: { member, t }, path, notice, look, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const write = can(member, "publish") ? { label: t.shell.write, href: "/chest/new" } : role ? { label: t.shell.propose, href: "/chest/propose" } : null;
  const tools = (
    <>
      {role && path !== "/chest/search" && <Island name="Search" props={{ id: "top-search", labels: t.kit.search }} />}
      {write && !composing(path) && <a className="button small write" href={write.href}><Pen /><span>{write.label}</span></a>}
    </>
  );
  return (
    <>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark><span>{t.tool.name}</span></a>}
        path={path}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        tools={tools}
        labels={{ skip: t.shell.skip, nav: t.shell.sections }}
        width="full"
      >
        {notice && <p className="notice" role="alert">{notice}</p>}
        {role ? children : <div className="narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </AppShell>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
      <Island id="ready" name="Ready" props={{}} />
    </>
  );
}

// The host's root, outside the Chest's members' part: News has no public
// part (a Chest answers 404 there); reached without a Chest, it says where
// News lives.
export function PublicLayout({ viewer: { t }, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <>
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <main id="main" className="page public" tabIndex={-1}>
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
      </main>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
      <Island id="ready" name="Ready" props={{}} />
    </>
  );
}
