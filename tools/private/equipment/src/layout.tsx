import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, LanguageSwitch, NoAccess, type NavItem } from "@argentic/chest-ui/components";
import { Gauge, People, Person, Shelves } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { languageNames, locales } from "./i18n/index.ts";
import { can, roleOf } from "./lib/access.ts";

// What goes around every page. For members, the kit's shell as the steel
// bar: the tool's mark (or, in brand mode, the company's logo, in its
// variant for a dark ground — the bar is dark in both modes), the sections
// as labelled tabs, the search, who is signed in and as what. Managers
// find the overview first; members, their own equipment. A member whose
// role gives nothing sees why, not an error. Then the toasts (outside
// <main>: a toast and its Undo outlive a page changed in place) and a
// refusal of a form sent without JavaScript (notice).
export function MembersLayout({ viewer: { member, t }, look, path, notice, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const manager = can(member, "items.manage");
  const brand = <a href="/chest"><BrandMark logo={look?.logo ?? null} ground="dark"><Mark /></BrandMark><span>{t.tool.name}</span></a>;
  const labels = { skip: t.shell.skip, nav: t.shell.nav };
  const nav: NavItem[] = !role ? [] : manager
    ? [
      { href: "/chest", label: t.shell.overview, icon: <Gauge />, match: "exact" },
      { href: "/chest/items", label: t.shell.items, icon: <Shelves />, also: ["/chest/labels", "/chest/import", "/chest/inventory", "/chest/settings"] },
      { href: "/chest/people", label: t.shell.people, icon: <People /> },
      { href: "/chest/mine", label: t.shell.mine, icon: <Person /> },
    ]
    : [
      { href: "/chest", label: t.shell.mine, icon: <Person />, match: "exact", also: ["/chest/mine", "/chest/people"] },
      { href: "/chest/items", label: t.shell.items, icon: <Shelves /> },
    ];
  return (
    <>
      <AppShell
        brand={brand}
        nav={nav}
        path={path}
        tools={role ? <Island name="SearchBox" props={{ labels: t.search, maxLength: 100 }} /> : null}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        labels={labels}
        width="full"
      >
        {notice && <p className="notice" role="alert">{notice}</p>}
        {role ? children : <div className="narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </AppShell>
      <Island id="toasts" name="ToastHost" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}

// Outside /chest: Equipment has no public part, so a visitor only ever
// sees an error page here, or the page that says where the tool lives. In
// brand mode the company's logo stands beside the tool's name.
export function PublicLayout({ viewer: { locale, t }, look, path, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <div className="public">
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <header className="public-head">
        <span className="brand"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark>{t.tool.name}</span>
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] }))} current={locale} label={t.pages.language} back={path} />
      </header>
      <main id="main" tabIndex={-1}>
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
      </main>
      <Island id="toasts" name="ToastHost" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </div>
  );
}
