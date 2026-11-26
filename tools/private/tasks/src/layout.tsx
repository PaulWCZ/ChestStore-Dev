import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, LanguageSwitch, NoAccess } from "@argentic/chest-ui/components";
import { Grid, Home } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { languageNames, locales } from "./i18n/index.ts";
import { roleOf } from "./lib/access.ts";

// What goes around every page: the kit's shell for members (the Tasks
// mark — or, in brand mode, the company's logo — its sections as labelled
// tabs, the card search at the right of the header, who is signed in and
// as what), a plain page for visitors; the toasts; a refusal of a form sent
// without JavaScript (notice). A member whose role gives nothing sees why,
// not an error.
export function MembersLayout({ viewer: { member, t }, look, path, notice, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const nav = role ? [
    { href: "/chest", label: t.shell.myTasks, icon: <Home />, exact: true },
    { href: "/chest/boards", label: t.shell.boards, icon: <Grid /> },
  ] : [];
  return (
    <>
    <AppShell
      brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark>{t.tool.name}</a>}
      nav={nav}
      path={path}
      member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
      tools={role ? <Island name="SearchBox" props={{ labels: t.searchBox }} /> : null}
      labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      width="full"
    >
      {notice && <p className="notice" role="alert">{notice}</p>}
      {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
    </AppShell>
    {/* Outside <main>: a toast and its Undo outlive a page changed in place. */}
    <Island name="ToastHost" id="toasts" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}

// Outside /chest: Tasks has no public part, so a visitor only ever sees an
// error page here, or the page that says where Tasks lives.
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
