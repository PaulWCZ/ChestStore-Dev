import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, LanguageSwitch, NoAccess } from "@argentic/chest-ui/components";
import { Building, Chart, Person, Pipeline, Today } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { languageNames, locales } from "./i18n/index.ts";
import { can, roleOf } from "./lib/access.ts";

// What goes around every page of the members' part: the kit's shell (the
// Clients mark — or, in brand mode, the company's logo — its sections as
// labelled tabs, a row of their own on a phone; the client search and,
// for whoever may, the "More" menu at the right of the header; who is
// signed in and as what), the toasts, a refusal of a form sent without
// JavaScript (notice). A member whose role gives nothing sees why, not an
// error.
export function MembersLayout({ viewer: { member, t }, look, path, notice, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const nav = role ? [
    { href: "/chest", label: t.shell.myDay, icon: <Today />, match: "exact" as const },
    { href: "/chest/deals", label: t.shell.deals, icon: <Pipeline /> },
    { href: "/chest/companies", label: t.shell.companies, icon: <Building /> },
    { href: "/chest/contacts", label: t.shell.contacts, icon: <Person /> },
    { href: "/chest/team", label: t.shell.team, icon: <Chart /> },
  ] : [];
  const more = { import: role !== null && can(member, "import"), settings: role !== null && can(member, "stages"), exportAll: role !== null && can(member, "export.all") };
  return (
    <>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark><span>{t.tool.name}</span></a>}
        nav={nav}
        path={path}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        tools={role ? <Island name="HeaderTools" props={{ search: t.searchBox, more, words: { more: t.shell.more, import: t.shell.import, settings: t.shell.settings, exportAll: t.shell.exportAll } }} /> : null}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
        width="full"
      >
        {notice && <p className="notice" role="alert">{notice}</p>}
        {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
      </AppShell>
      {/* Outside <main>: a toast and its Undo outlive a page changed in place. */}
      <Island name="ToastHost" id="toasts" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy, tooLarge: t.errors.too_large } }} />
    </>
  );
}

// Outside /chest: Clients has no public part, so a visitor only ever sees
// an error page here, or the page that says where Clients lives.
export function PublicLayout({ viewer: { locale, t }, look, path, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <div className="public">
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <header className="public-head">
        <span className="brand"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark>{t.tool.name}</span>
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] }))} current={locale} label={t.pages.language} back={path} />
      </header>
      <main id="main" tabIndex={-1} className="page">
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
      </main>
      <Island name="ToastHost" id="toasts" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </div>
  );
}
