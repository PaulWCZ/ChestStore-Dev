import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, type NavItem } from "@argentic/chest-ui/components";
import { Book, Home, Search, Trash } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { trashShown } from "./frame.tsx";
import { roleOf } from "./lib/access.ts";

// What goes around every page of /chest: the kit's shell — skip link,
// header, the sections as labelled tabs (a row of their own under the
// header on a phone, never behind a menu), the member chip — with the
// wiki's mark (the company's logo in brand mode) and the header's search
// box. The page itself brings the sidebar (src/frame.tsx: every space and
// its tree, on wide screens). While a page is being edited, the search box
// steps aside. A member whose role gives nothing sees why (the page is the
// kit's NoAccess, src/app.tsx), with no sections.
//
// The toasts sit outside the page's main region, under an id: a page met
// by navigate() keeps them, and a toast's Undo with them — the Undo of a
// deleted page follows its editor to the space.

const editing = (path: string) => /^\/chest\/pages\/\d+\/edit$/u.test(path);

export function MembersLayout({ viewer: { member, t }, path, notice, look, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  // A reader's trash holds their own private pages: the section shows for
  // whoever writes, and for a reader with "My pages" (src/frame.tsx).
  const nav: NavItem[] = role === null ? [] : [
    { href: "/chest", label: t.shell.home, icon: <Home />, exact: true },
    // A space is a part of "Pages" (its first page, in a way): the tab
    // says so there too.
    { href: "/chest/pages", label: t.shell.pages, icon: <Book />, also: ["/chest/spaces"] },
    { href: "/chest/search", label: t.shell.searchShort, icon: <Search /> },
    ...(trashShown(member) ? [{ href: "/chest/trash", label: t.shell.trash, icon: <Trash /> }] : []),
  ];
  const tools = role === null || editing(path) ? null : <div className="bar-search"><Island name="Search" props={{ labels: t.kit.search, placeholder: t.shell.search }} /></div>;
  return (
    <>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark><span className="brand-name">{t.tool.name}</span></a>}
        nav={nav}
        path={path}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        tools={tools}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
        width="full"
      >
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
      </AppShell>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
      <Island id="ready" name="Ready" props={{}} />
    </>
  );
}

// The host's root, outside the Chest's members' part: the wiki has no
// public part (a Chest answers 404 there); reached without a Chest, it
// says where the wiki lives.
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
