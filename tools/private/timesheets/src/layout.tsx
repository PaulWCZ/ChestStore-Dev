import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, LanguageSwitch, NoAccess, type NavItem } from "@argentic/chest-ui/components";
import { Bars, Folder, Gear, Grid, People } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { languageNames, locales } from "./i18n/index.ts";
import { can, roleOf } from "./lib/access.ts";

// What goes around every page. The members' part: the kit's shell — the
// instrument panel on top (the tool's stopwatch, or the company's logo in
// brand mode; the sections as labelled tabs, a row of their own on a
// phone; the member) —, the timer under it on every page (an island the
// page feeds: src/timer-view.ts), the page re-read when the person comes
// back to it (never on a timer). A member whose role gives nothing sees why, not an error.
// Both parts: the toasts, outside the page's main region, under an id (a
// page met by navigate() keeps them, and a toast's Undo with them); the
// refusal of a form sent without JavaScript (notice).
export function MembersLayout({ viewer: { member, t }, look, notice, path, data, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const brand = <a href="/chest"><BrandMark logo={look?.logo ?? null} ground="dark"><Mark /></BrandMark><span>{t.tool.name}</span></a>;
  const labels = { skip: t.shell.skip, nav: t.shell.nav };
  const toasts = <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />;
  if (!role) {
    return (
      <>
        <AppShell brand={brand} labels={labels} width="narrow" path={path}>
          <div className="page narrow">
            <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />
          </div>
        </AppShell>
        {toasts}
      </>
    );
  }
  const nav: NavItem[] = [
    { href: "/chest", label: t.shell.week, icon: <Grid />, exact: true },
    { href: "/chest/reports", label: t.shell.reports, icon: <Bars /> },
    ...(can(member, "approve") ? [{ href: "/chest/team", label: t.shell.team, icon: <People /> }] : []),
    ...(can(member, "projects.manage") ? [{ href: "/chest/projects", label: t.shell.projects, icon: <Folder /> }] : []),
    ...(can(member, "settings") ? [{ href: "/chest/settings", label: t.shell.settings, icon: <Gear /> }] : []),
  ];
  return (
    <>
      <AppShell brand={brand} nav={nav} path={path} member={{ name: member.name, role: t.roles[role], photo: member.photo }} labels={labels} width="full">
        {data.timer && <Island id="timer" name="TimerBar" props={data.timer} />}
        <Island id="auto-refresh" name="AutoRefresh" props={{ seconds: 60 }} />
        {notice && <div className="page"><p className="notice" role="alert">{notice}</p></div>}
        {children}
      </AppShell>
      {toasts}
    </>
  );
}

// The host's root and its error pages: Timesheets has no public part (a
// Chest answers 404 on its public host itself); reached without a Chest,
// the root says where the tool lives (src/pages/PublicHome.tsx).
export function PublicLayout({ viewer: { locale, t }, look, path, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <>
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <main id="main" className="page public" tabIndex={-1}>
        <div className="brand"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark>{t.tool.name}</div>
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] }))} current={locale} label={t.pages.language} back={path} />
      </main>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}
