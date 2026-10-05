import { AppShell, LanguageSwitch } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Island } from "./core/island.tsx";
import type { MemberContext, VisitorContext } from "./core/tool.ts";
import { languageNames, locales } from "./i18n/index.ts";

// What goes around every page: the kit's shell for members (the tool's
// name, its sections as tabs, who is signed in), a plain header for
// visitors; the toasts; a refusal of a form sent without JavaScript
// (notice). A new section is one line of nav.
type Props<V> = { viewer: V; path: string; notice: string | null; children: ReactNode };

export function MembersLayout({ viewer: { member, t }, path, notice, children }: Props<MemberContext>) {
  const nav = [{ href: "/chest", label: t.nav.notes }];
  return (
    <AppShell brand={<a className="brand" href="/chest">{t.tool.name}</a>} nav={nav} path={path} labels={t.kit.shell} member={{ name: member.name, photo: member.photo }}>
      {notice && <p className="notice" role="alert">{notice}</p>}
      {children}
      <Island name="ToastHost" props={{ labels: t.kit.toast, unavailable: t.errors.unavailable }} />
    </AppShell>
  );
}

export function PublicLayout({ viewer: { locale, t }, path, notice, children }: Props<VisitorContext>) {
  return (
    <div className="public">
      <a className="ck-skip" href="#main">{t.kit.shell.skip}</a>
      <header className="public-head">
        <span className="brand">{t.tool.name}</span>
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] }))} current={locale} label={t.contact.language} back={path} />
      </header>
      <main id="main" tabIndex={-1}>
        {notice && <p className="notice" role="alert">{notice}</p>}
        {children}
      </main>
      <Island name="ToastHost" props={{ labels: t.kit.toast, unavailable: t.errors.unavailable }} />
    </div>
  );
}
