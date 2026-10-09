import { EmptyState } from "@argentic/chest-ui/components";
import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { localeOf } from "./i18n/index.ts";
import { PublicShell } from "./pages/public-shell.tsx";
import { TeamFrame } from "./pages/frame.tsx";

// What goes around every page. The team's frame — the kit's shell, the
// sections, the column of folders and saved views with their counts — is
// drawn by each page (src/pages/frame.tsx, through src/app.tsx's team()),
// since it reads the database; the public frame — the company's name or
// logo, the language switch — by each public page, since it speaks the
// page's language. Here: the toasts (outside <main>, with a stable id:
// they survive a move to another page, and a toast's Undo with them), and
// for an error page (status ≠ 200), which has no frame of its own, a
// plain one.
export function MembersLayout({ viewer: { member, t }, path, notice, look, status, children }: LayoutProps<MemberContext>) {
  return (
    <>
      {status === 200 ? children : (
        <TeamFrame member={member} t={t} path={path} logo={look?.logo ?? null} notice={notice} desk={null}>
          {children}
        </TeamFrame>
      )}
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}

export function PublicLayout({ viewer: { t, locale }, look, path, notice, status, children }: LayoutProps<VisitorContext>) {
  return (
    <>
      {status === 200 ? children : (
        <PublicShell company={t.public.teamPlain} logo={look?.logo ?? null} locale={localeOf(locale)} back={path} t={t} notice={notice}>
          {/* A follow-up link that does not work (404): said as such, with
              the way to write anew. */}
          {status === 404 && path.startsWith("/t/") ? <EmptyState headingLevel={1} title={t.public.notFoundTitle} body={t.public.notFoundBody}/> : children}
          {status === 404 && <p><a className="button" href="/">{t.public.newRequest}</a></p>}
        </PublicShell>
      )}
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}
