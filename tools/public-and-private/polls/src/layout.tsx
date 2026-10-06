import { AppShell, BrandMark, NoAccess } from "@argentic/chest-ui/components";
import type { Look } from "@argentic/chest-ui/runtime";
import type { ReactNode } from "react";
import { Mark } from "./components/mark.tsx";
import { Island } from "./core/island.tsx";
import type { MemberContext, VisitorContext } from "./core/tool.ts";
import { roleOf } from "./lib/access.ts";
import { PublicTop } from "./pages/PublicTop.tsx";

// What goes around every page: the kit's shell for members (the mark or
// the company's logo, who is signed in), a plain header for visitors; the
// toasts; a refusal of a form sent without JavaScript (notice). Polls has
// one place — the home page lists every poll — so the header holds no
// sections; each page's main action sits at the top of the page ("New
// poll" on the home page). A member whose role gives nothing sees why, not
// an error. In brand mode the company's logo stands where the Polls mark is.
//
// The toasts sit outside the page's main region, under an id: a page met
// by navigate() (src/core/client.tsx) keeps them, and a toast's Undo with
// them ("Poll deleted", then the home page).
type Props<V> = { viewer: V; look: Look; path: string; notice: string | null; top?: boolean; children: ReactNode };

export function MembersLayout({ viewer: { member, t }, look, notice, children }: Props<MemberContext>) {
  const role = roleOf(member);
  return (
    <>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.tool.name}</span></a>}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        labels={{ ...t.kit.shell, skip: t.shell.skip, nav: t.shell.nav }}
        width="normal"
      >
        {notice && <p className="notice" role="alert">{notice}</p>}
        {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
      </AppShell>
      <div id="toasts">
        <Island name="ToastHost" props={{ labels: t.kit.toast, unavailable: t.errors.unavailable }} />
      </div>
    </>
  );
}

// The public host: the page's main region, the toasts. Each public page
// draws its own top — the brand (the company's logo, or Polls' mark) and
// the language switch — as its words differ (src/pages/PublicTop.tsx);
// for a page that draws none (an error page: top), the layout draws it.
export function PublicLayout({ viewer: { t, locale }, look, path, notice, top = false, children }: Props<VisitorContext>) {
  return (
    <>
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <main id="main" className="page public" tabIndex={-1}>
        {top && <PublicTop look={look} name={t.tool.name} locale={locale} back={path} t={t} />}
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
      </main>
      <div id="toasts">
        <Island name="ToastHost" props={{ labels: t.kit.toast, unavailable: t.errors.unavailable }} />
      </div>
    </>
  );
}
