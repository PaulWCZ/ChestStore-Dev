import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, LanguageSwitch, NoAccess, type NavItem } from "@argentic/chest-ui/components";
import { Contours } from "./components/contours.tsx";
import { Calendar, Compass, Flag, Gear, People } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { languageNames, locales } from "./i18n/index.ts";
import { can, roleOf } from "./lib/access.ts";

// What goes around every page. The members' part is in the kit's shell
// (skip link, the map's dark header with its contour lines in the Trail
// map, the sections as labelled tabs — a row of their own on a phone —,
// the member chip); a member whose role gives nothing sees why, not an
// error. In brand mode the company's logo stands where Goals' mark is. The
// toasts sit outside <main> with a stable id: a toast and its Undo outlive
// a page changed in place. A form refused without JavaScript says why
// (notice).
export function MembersLayout({ viewer: { member, t }, look, path, notice, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  // An objective, and the import, belong to "Company".
  const nav: NavItem[] = role
    ? [
        { href: "/chest", label: t.shell.myGoals, icon: <Flag />, match: "exact" },
        { href: "/chest/company", label: t.shell.company, icon: <Compass />, also: ["/chest/objectives", "/chest/import"] },
        { href: "/chest/teams", label: t.shell.teams, icon: <People /> },
        { href: "/chest/cycles", label: t.shell.cycles, icon: <Calendar /> },
        ...(can(member, "settings.manage") ? [{ href: "/chest/settings", label: t.shell.settings, icon: <Gear /> }] : []),
      ]
    : [];
  return (
    <>
      <AppShell
        brand={<><Contours /><a href="/chest"><BrandMark logo={look?.logo ?? null} ground="light"><Mark /></BrandMark><span className="brand-name">{t.meta.name}</span></a></>}
        nav={nav}
        path={path}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
        width="full"
      >
        {notice && <p className="notice" role="alert">{notice}</p>}
        {role ? children : <div className="narrow"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} /></div>}
      </AppShell>
      <Island id="toasts" name="ToastHost" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy, tooLarge: t.errors.too_large } }} />
    </>
  );
}

// Outside /chest: Goals has no public part ("public" is not in chest.json),
// so the Chest never routes a visitor here. Opened from the tool's own
// process, a page says where Goals lives, in the visitor's language.
export function PublicLayout({ viewer: { locale, t }, look, path, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <main id="main" tabIndex={-1} className="public">
      <div className="brand"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark>{t.meta.name}</div>
      {notice && <p className="notice" role="alert">{notice}</p>}
      {children}
      <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={t.pages.language} back={path} />
      <Island id="toasts" name="ToastHost" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy, tooLarge: t.errors.too_large } }} />
    </main>
  );
}
