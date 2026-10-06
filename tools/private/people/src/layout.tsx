import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, LanguageSwitch, MemberChip, NoAccess, type NavItem } from "@argentic/chest-ui/components";
import { CheckList, Clipboard, Folder, People, Tree } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { languageNames, locales } from "./i18n/index.ts";
import { can, roleOf } from "./lib/access.ts";

// What goes around every page of the members' part: the kit's shell (skip
// link, the People mark — or, in brand mode, the company's logo —, the
// sections as labelled tabs, the member chip linking to one's own
// profile), and the toasts (outside <main>, so a toast and its Undo
// outlive a page changed in place); a refusal of a form sent without
// JavaScript (notice). A member whose role gives nothing sees why, not an
// error.
// The number on "My to-dos" comes from the page (src/app.tsx, people():
// rendering is synchronous, a layout reads nothing itself); an error page
// gives none.
export function MembersLayout({ viewer: { member, t }, look, path, notice, data, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const todo = data.todo ?? 0;
  // A section is also current on the pages below it that live elsewhere (a
  // profile is the directory's; the numbers are the records').
  const nav: NavItem[] = role
    ? [
        { href: "/chest", label: t.shell.directory, icon: <People />, exact: true, also: ["/chest/people", "/chest/import", "/chest/table"] },
        { href: "/chest/chart", label: t.shell.chart, icon: <Tree /> },
        { href: "/chest/todo", label: t.shell.todo, icon: <CheckList />, ...(todo > 0 ? { count: todo } : {}) },
        ...(can(member, "checklists.manage") ? [{ href: "/chest/checklists", label: t.shell.checklists, icon: <Clipboard /> }] : []),
        ...(can(member, "records.manage") ? [{ href: "/chest/records", label: t.shell.records, icon: <Folder />, also: ["/chest/numbers"] }] : []),
      ]
    : [];
  const mine = `/chest/people/${member.id}`;
  const chip = role
    ? <a className="me" href={mine} aria-current={path === mine ? "page" : undefined}><MemberChip name={member.name} role={t.roles[role]} photo={member.photo} /><span className="ck-vh">{t.shell.me}</span></a>
    : <MemberChip name={member.name} role={null} photo={member.photo} />;
  return (
    <>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark>{t.tool.name}</a>}
        nav={nav}
        path={path}
        tools={chip}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
        width="full"
      >
        {notice && <p className="banner warn notice" role="alert">{notice}</p>}
        {role ? children : <div className="page narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </AppShell>
      <Island name="ToastHost" id="toasts" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}

// Outside /chest: People has no public part ("public" is not in
// chest.json), so the Chest never routes a visitor here; opened from the
// tool's own process, a page says where People lives (or an error page).
export function PublicLayout({ viewer: { locale, t }, look, path, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <div className="public">
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <header className="public-head">
        <span className="brand"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark>{t.tool.name}</span>
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={t.pages.language} back={path} />
      </header>
      <main id="main" tabIndex={-1} className="page narrow">
        {notice && <p className="banner warn notice" role="alert">{notice}</p>}
        {children}
      </main>
      <Island name="ToastHost" id="toasts" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </div>
  );
}
