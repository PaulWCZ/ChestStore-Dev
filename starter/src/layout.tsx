import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, LanguageSwitch } from "@argentic/chest-ui/components";
import { languageNames, locales } from "./i18n/index.ts";

// What goes around every page: the kit's shell for members (the tool's
// name, its sections, who is signed in), a plain header for visitors; the
// toasts; a refusal of a form sent without JavaScript (notice). Only the
// words of t.tool, t.pages and t.kit here — never a page's own.
// Sections: one { href, label } each in nav, when the tool has two or more.
const nav: { href: string; label: string }[] = [];

export function MembersLayout({ viewer: { member, t }, path, notice, children }: LayoutProps<MemberContext>) {
  return (
    <AppShell brand={<a className="brand" href="/chest">{t.tool.name}</a>} nav={nav} path={path} labels={t.kit.shell} member={{ name: member.name, photo: member.photo }}>
      {notice && <p className="notice" role="alert">{notice}</p>}
      {children}
      <Island name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </AppShell>
  );
}

export function PublicLayout({ viewer: { locale, t }, path, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <div className="public">
      <a className="ck-skip" href="#main">{t.kit.shell.skip}</a>
      <header className="public-head">
        <span className="brand">{t.tool.name}</span>
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] }))} current={locale} label={t.pages.language} back={path} />
      </header>
      <main id="main" tabIndex={-1}>
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
      </main>
      <Island name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </div>
  );
}
