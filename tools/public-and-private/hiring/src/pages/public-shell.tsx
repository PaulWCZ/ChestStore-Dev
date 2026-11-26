import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { languageNames, locales, type Catalogue, type Locale } from "../i18n/index.ts";
import type { Brand } from "../lib/careers.ts";

// The frame of the careers pages: the company's name or logo (a link
// home), the language switch, the footer with a link to the company's
// website. Never the Chest's name: the candidate is visiting the company.
//
// Whose look wins (DESIGN.md, "Looks"): the company's brand, chosen in its
// Chest, is the company speaking — its colours are the page's (the look's
// stylesheet, src/theme.ts) and its logo, with its dark variant, the one
// shown; Hiring's own logo and colour wait. Otherwise Hiring's own look in
// the colour chosen in its settings, and the logo uploaded there.
export function PublicShell({ company, logo, brand, locale, back, t, foot, children }: { company: string; logo: { url: string; alt: string; dark?: string | null } | null; brand: Brand | null; locale: Locale; back: string; t: Catalogue; foot: ReactNode; children: ReactNode }) {
  const own = brand?.logo ? <img className="logo" src={brand.logo} alt={company} /> : company;
  const mark = logo ? <BrandMark logo={{ ...logo, alt: company }} /> : own;
  return (
    <div className="public">
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <header className="public-top">
        <a className="wordmark" href="/">{mark}</a>
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={t.careers.language} back={back} />
      </header>
      <main className="public-main" id="main" tabIndex={-1}>{children}</main>
      <footer className="public-foot">
        {foot}
        {brand?.website && <a className="site-link" href={brand.website} rel="noopener">{t.careers.website}</a>}
      </footer>
    </div>
  );
}
