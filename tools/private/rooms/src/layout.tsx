import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, NoAccess, type NavItem } from "@argentic/chest-ui/components";
import { Badge, Building, Desk, Door, People, Week } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { can, roleOf } from "./lib/access.ts";

// What goes around every page. The members' part: the kit's shell (skip
// link, header, the sections as labelled tabs — a row of their own under
// the header on a phone, never icons alone —, the member chip); in brand
// mode the company's logo stands where the Rooms mark is. A member whose
// role gives nothing sees why, not an error. Both parts: the toasts,
// outside the page's main region, under an id (a page met by navigate()
// keeps them, and a toast's Undo with them); the refusal of a form sent
// without JavaScript (notice).
export function MembersLayout({ viewer: { member, t }, look, path, notice, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const nav: NavItem[] = role
    ? [
        { href: "/chest", label: t.shell.week, icon: <Week />, exact: true },
        { href: "/chest/desks", label: t.shell.desks, icon: <Desk /> },
        { href: "/chest/rooms", label: t.shell.rooms, icon: <Door /> },
        { href: "/chest/people", label: t.shell.people, icon: <People /> },
        { href: "/chest/visitors", label: t.shell.visitors, icon: <Badge /> },
        ...(can(member, "places.manage") ? [{ href: "/chest/places", label: t.shell.places, icon: <Building /> }] : []),
      ]
    : [];
  return (
    <>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark><span className="brand-name">{t.tool.name}</span></a>}
        nav={nav}
        path={path}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
        width="full"
      >
        {notice && <div className="narrow"><p className="notice" role="alert">{notice}</p></div>}
        {role ? children : <div className="narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </AppShell>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy, tooLarge: t.errors.too_large } }} />
    </>
  );
}

// The host's root and its error pages: Rooms has no public part (a Chest
// answers 404 there itself); reached without a Chest, the root says where
// Rooms lives (src/pages/PublicHome.tsx).
export function PublicLayout({ viewer: { t }, look, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <>
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <main id="main" className="page public" tabIndex={-1}>
        <div className="brand"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark>{t.tool.name}</div>
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
      </main>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}
