import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, EmptyState, NoAccess } from "@argentic/chest-ui/components";
import { Mark } from "./components/mark.tsx";
import { RespondFrame } from "./components/respond-frame.tsx";
import { localeOf } from "./i18n/index.ts";
import { roleOf } from "./lib/access.ts";
import { companyName } from "./lib/public-origin.ts";

// What goes around every page.
//
// Members: the kit's shell — the mark (or the company's logo in brand
// mode) and the tool's name leading home, who is signed in. Forms has one
// section (the forms; a form's own tabs are in its pages), so no sections
// in the bar. A member whose role gives nothing sees why, not an error. A
// team form to answer (/chest/f/…) is drawn as its respondents see it:
// the page brings its own frame (data.respond).
//
// Visitors: each public page draws its frame — the company's name or
// logo, the language switch, the form's colour (src/components/
// respond-frame.tsx) —; an error page (a link that opens no form) gets
// the same frame here.
//
// data-look says whether the page wears Forms' own look (a form's colours
// then keep their soft page grounds: src/tokens.css). The toasts sit
// outside the page's main region, under an id: a page met in place keeps
// them, and a toast's Undo with them.
export function MembersLayout({ viewer: { member, t }, look, notice, data, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  return (
    <div className="look" data-look={data.own ? "own" : "chosen"}>
      {data.respond && role ? children : (
        <AppShell
          brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark><span>{t.meta.name}</span></a>}
          member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
          labels={{ ...t.kit.shell, skip: t.shell.skip, nav: t.shell.nav }}
          width="wide"
        >
          {notice && <p className="notice" role="alert">{notice}</p>}
          {role ? <div className="work">{children}</div> : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
        </AppShell>
      )}
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy, tooLarge: t.errors.too_large, limit: t.errors.limit } }} />
    </div>
  );
}

export function PublicLayout({ viewer: { t, locale }, look, path, notice, status, data, children }: LayoutProps<VisitorContext>) {
  return (
    <div className="look" data-look={data.own ? "own" : "chosen"}>
      {status === 200 ? children : (
        <RespondFrame accent="berry" company={companyName() || t.public.title} logo={look?.logo ?? null} locale={localeOf(locale)} languageLabel={t.public.language} back={path} footer={t.meta.tagline}>
          <section className="runner runner-notice" role="status">
            {status === 404 ? <EmptyState headingLevel={1} title={t.notFound.formTitle} body={t.notFound.formBody} /> : children}
          </section>
        </RespondFrame>
      )}
      {notice && status === 200 && <p className="notice" role="alert">{notice}</p>}
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy, tooLarge: t.errors.too_large, limit: t.errors.limit } }} />
    </div>
  );
}
