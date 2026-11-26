import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, LanguageSwitch, NoAccess, type NavItem } from "@argentic/chest-ui/components";
import { Download, Gear, Plus, Receipt, Stamp, Wallet } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { languageNames, locales } from "./i18n/index.ts";
import { can, roleOf } from "./lib/access.ts";

// What waits in each section (the tabs' numbers): read by the page's
// handler (src/app.tsx, `expenses()`) and told to the layout (View.layout;
// none on an error page).
export type NavCounts = { approve: number; pay: number };

// The members' part, in the kit's shell: the tool's mark (or the company's
// logo in brand mode), the sections as labelled tabs with what waits in
// each, the member, the search and "Add" — the tool's one job — at the
// right on a wide screen (on a phone, the dock of "My expenses" holds it).
// A member whose role gives nothing sees why, not an error. The toasts sit
// outside <main>, under an id: a page met by navigate() keeps them, and a
// toast's Undo with them.
export function MembersLayout({ viewer: { member, t }, path, notice, look, status, data, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const brand = <a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark><span>{t.meta.name}</span></a>;
  const counts = data.counts;
  const nav: NavItem[] = role ? [
    { href: "/chest", label: t.shell.mine, icon: <Receipt />, exact: true, also: ["/chest/new", "/chest/expenses", "/chest/search"] },
    ...(can(member, "approve") ? [{ href: "/chest/approve", label: t.shell.approve, icon: <Stamp />, ...(counts ? { count: counts.approve } : {}) }] : []),
    ...(can(member, "pay") ? [{ href: "/chest/pay", label: t.shell.pay, icon: <Wallet />, ...(counts ? { count: counts.pay } : {}), also: ["/chest/cards"] }] : []),
    ...(can(member, "export") ? [{ href: "/chest/export", label: t.shell.export, icon: <Download /> }] : []),
    { href: "/chest/settings", label: t.shell.settings, icon: <Gear /> },
  ] : [];
  const tools = role ? (
    <>
      {path !== "/chest/search" && <Island name="SearchBox" props={{ labels: t.search, className: "top-search" }} />}
      <a className="button small top-add" href="/chest/new"><Plus />{t.shell.add}</a>
    </>
  ) : null;
  return (
    <>
      <AppShell brand={brand} nav={nav} path={path} member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }} tools={tools} labels={{ skip: t.shell.skip, nav: t.shell.nav }} width="full">
        {notice && <p className="notice bad page-notice" role="alert">{notice}</p>}
        {role ? (status >= 400 ? <div className="page">{children}</div> : children) : <div className="page"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </AppShell>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}

// Outside /chest: Expenses has no public part (a Chest answers 404 on its
// public host), so a visitor only ever sees an error page here, or the page
// that says where Expenses lives.
export function PublicLayout({ viewer: { locale, t }, look, path, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <div className="public">
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <header className="public-head">
        <span className="brand"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark>{t.meta.name}</span>
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={t.pages.language} back={path} />
      </header>
      <main id="main" tabIndex={-1} className="page">
        {notice && <p className="notice bad page-notice" role="alert">{notice}</p>}
        {children}
      </main>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </div>
  );
}
