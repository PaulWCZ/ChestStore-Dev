import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, LanguageSwitch, NoAccess, type NavItem } from "@argentic/chest-ui/components";
import { Box, Desk, Invoice, People, Quote } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { languageNames, locales } from "./i18n/index.ts";
import { can, roleOf } from "./lib/access.ts";

// What a page tells the layout around it (View.layout; {} on an error
// page): the overdue invoices, a true count on the Invoices tab; the
// company's name, which the public frame shows.
export type LayoutData = { overdue: number; company: string };

// The members' frame: the kit's AppShell (skip link, header, labelled
// sections — a row of their own under the header on a phone, never icons
// alone, never hidden —, the member chip). The five places of every day
// are sections; the rare ones (the bank statement, the accountant's
// export, importing the invoices still to collect, the settings) wait in a
// "More" menu at the right of the header (an island: the kit's ARIA menu
// button). In brand mode the company's logo stands where the Quotes mark
// does. A member whose role gives nothing sees why, not an error. The
// toasts sit outside <main>, under an id: a page met by navigate() keeps
// them, and a toast's Undo with them; a refusal of a form sent without
// JavaScript is the notice.
export function MembersLayout({ viewer: { member, t }, look, path, notice, data, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const s = t.shell;
  const overdue = data.overdue ?? 0;
  const nav: NavItem[] = role ? [
    { href: "/chest", label: s.desk, icon: <Desk />, match: "exact" },
    { href: "/chest/quotes", label: s.quotes, icon: <Quote /> },
    { href: "/chest/invoices", label: s.invoices, icon: <Invoice />, also: ["/chest/bank"], ...(overdue > 0 ? { count: overdue } : {}) },
    { href: "/chest/clients", label: s.clients, icon: <People /> },
    { href: "/chest/catalogue", label: s.catalogue, icon: <Box /> },
  ] : [];
  const more = role ? [
    ...(can(member, "payments") ? [{ href: "/chest/bank", label: s.bank, icon: "coins" as const }] : []),
    ...(can(member, "export") ? [{ href: "/chest/export", label: s.export, icon: "download" as const }] : []),
    ...(can(member, "invoices.issue") ? [{ href: "/chest/import?kind=invoices", label: s.importInvoices, icon: "upload" as const }] : []),
    { href: "/chest/settings", label: s.settings, icon: "gear" as const },
  ] : [];
  return (
    <>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark><span>{t.meta.name}</span></a>}
        nav={nav}
        path={path}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        tools={role ? <Island name="MoreMenu" props={{ label: s.more, items: more }} /> : null}
        labels={{ skip: s.skip, nav: s.nav }}
        width="full"
      >
        {notice && <p className="page-notice error" role="alert">{notice}</p>}
        {role ? children : <div className="page narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </AppShell>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}

// The frame of the public pages: the company — its logo when the Chest
// gives its brand, else its name — and the language switch (each language
// named in itself). Never the Chest's name: the client talks to the
// company. The company's name comes from the page (data.company); an error
// page names the tool.
export function PublicLayout({ viewer: { locale, t }, look, path, notice, data, children }: LayoutProps<VisitorContext>) {
  return (
    <>
      <a className="ck-skip" href="#main">{t.kit.shell.skip}</a>
      <div className="public-frame">
        <header className="public-top">
          <span className="company"><BrandMark logo={look?.logo ?? null}>{data.company || t.meta.name}</BrandMark></span>
          <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={t.public.language} back={path} />
        </header>
        <main className="public-main" id="main" tabIndex={-1}>
          {notice && <p className="page-notice error" role="alert">{notice}</p>}
          {children}
        </main>
      </div>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}
