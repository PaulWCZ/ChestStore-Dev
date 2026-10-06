import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, EmptyState, NoAccess, type NavItem } from "@argentic/chest-ui/components";
import { Briefcase, Chart, Gear, Star } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { localeOf, type Catalogue } from "./i18n/index.ts";
import { can, roleOf } from "./lib/access.ts";
import { PublicShell } from "./pages/public-shell.tsx";

// What goes around every page.
//
// The team's frame, in the kit's shell: the sections as labelled tabs (a
// row of their own on a phone), the search ("/" focuses it), who is signed
// in — and the page read again while it is seen (the Chest has no
// WebSocket: AutoRefresh, the package's useAutoRefresh, which stops when
// the reader is idle so the tool may sleep). A job's board, a candidate,
// the emails to file and a search are parts of "Jobs": its tab stays
// current there. A member whose role gives nothing sees why, not an error.
//
// The public frame (the company's name or logo, the language switch, the
// footer) is drawn by each careers page, which reads the company's
// settings (src/pages/public-shell.tsx); here, an error page of the public
// part gets a plain one. The toasts sit outside <main> with a stable id:
// they survive a move to another page, and a toast's Undo with them.
const toasts = (t: Catalogue) => <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy, tooLarge: t.errors.too_large, limit: t.errors.limit } }} />;

export function MembersLayout({ viewer: { member, t }, path, notice, look, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const recruiter = can(member, "settings");
  const nav: NavItem[] = role ? [
    { href: "/chest", label: t.shell.jobs, icon: <Briefcase />, match: "exact", also: ["/chest/jobs", "/chest/candidates", "/chest/search"] },
    ...(recruiter ? [
      { href: "/chest/pool", label: t.shell.pool, icon: <Star /> },
      { href: "/chest/reports", label: t.shell.reports, icon: <Chart /> },
      { href: "/chest/settings", label: t.shell.settings, icon: <Gear /> },
    ] : []),
  ] : [];
  return (
    <div className="look" data-look={sourceOf(look)}>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark><span className="brand-name">{t.tool.name}</span></a>}
        nav={nav}
        path={path}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        tools={role ? <Island name="SearchBox" props={{ labels: { label: t.search.label, placeholder: t.search.placeholder, shortcut: t.search.shortcut, submit: t.search.go } }} /> : null}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
        width="wide"
      >
        {role && <Island name="AutoRefresh" props={{ seconds: 30 }} />}
        {notice && <p className="notice" role="alert">{notice}</p>}
        {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
      </AppShell>
      {toasts(t)}
    </div>
  );
}

export function PublicLayout({ viewer: { t, locale }, look, path, notice, status, children }: LayoutProps<VisitorContext>) {
  return (
    <div className="look" data-look={sourceOf(look)}>
      {status === 200 ? (
        <>
          {/* A refusal of a form sent without JavaScript (?error=): the
              careers pages draw their own frame, so it is said above it. */}
          {notice && <p className="notice notice-top" role="alert">{notice}</p>}
          {children}
        </>
      ) : (
        <PublicShell company={t.careers.titlePlain} logo={look?.logo ?? null} brand={null} locale={localeOf(locale)} back={path} t={t} foot={null}>
          {notice && <p className="notice" role="alert">{notice}</p>}
          {status === 404 ? <EmptyState headingLevel={1} title={t.pages.notFound.title} body={t.pages.notFound.publicBody} action={<a className="button quiet" href="/">{t.careers.allJobs}</a>} /> : children}
        </PublicShell>
      )}
      {toasts(t)}
    </div>
  );
}

// Where the page's look comes from, as the look of src/app.tsx says it
// ("own" when it says nothing).
function sourceOf(look: unknown): string {
  return look && typeof look === "object" && "source" in look && typeof look.source === "string" ? look.source : "own";
}
