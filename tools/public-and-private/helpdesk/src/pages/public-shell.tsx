import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { languageNames, locales, type Catalogue, type Locale } from "../i18n/index.ts";

// The frame of the public pages: the company's name — or, when the
// company gave its brand in its Chest, its logo (with its dark variant on
// dark pages) and its colours and fonts (the look's stylesheet, /look.css):
// the customer is on the company's own page — and the language switch.
// Never the Chest's name nor Support's mark: the customer talks to the
// company. Inside the company's own website (embed), no name: their page
// already says it.
//
// The switch goes through /lang/<code> (the package remembers the choice
// in a cookie) and comes back with ?lang=<code> in the address: a frame in
// another website may not keep the cookie, the address keeps the choice.
// Each language is named in itself, never translated.
export function withLanguage(path: string, code: string): string {
  const [base = "/", query = ""] = path.split("?");
  const search = new URLSearchParams(query);
  search.set("lang", code);
  return `${base}?${search.toString()}`;
}

export function PublicShell({ company, logo, locale, back, t, notice, foot, embed = false, children }: { company: string; logo: { url: string; alt: string; dark?: string | null } | null; locale: Locale; back: string; t: Catalogue; notice?: string | null; foot?: ReactNode; embed?: boolean; children: ReactNode }) {
  return (
    <div className={`public${embed ? " embed" : ""}`}>
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <header className="public-top">
        {embed ? <span /> : <span className="company">{logo ? <BrandMark logo={{ ...logo, alt: company }} /> : company}</span>}
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={t.public.language} href={code => `/lang/${code}?back=${encodeURIComponent(withLanguage(back, code))}`} />
      </header>
      <main className="public-main" id="main" tabIndex={-1}>
        {notice && <p className="notice danger" role="alert">{notice}</p>}
        {children}
      </main>
      {foot && <footer className="public-foot">{foot}</footer>}
    </div>
  );
}
