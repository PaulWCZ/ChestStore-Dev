import type { ReactNode } from "react";
import type { Brand } from "../lib/careers.ts";
import type { Locale } from "../lib/i18n/index.ts";
import { LanguageSwitch } from "./language-switch.tsx";

// The frame of the careers pages: the company's name or logo (a link
// home), the language switch, the footer with a link to the company's
// website. Never the Chest's name: the candidate is visiting the company.
// The company's accent (one of the tool's, checked for contrast) colours
// the page.
export function PublicShell({ company, locale, label, back, children, foot, brand, website }: { company: string; locale: Locale; label: string; back: string; children: ReactNode; foot: ReactNode; brand?: Brand; website?: string }) {
  return (
    <div className="public" data-accent={brand && brand.accent !== "cobalt" ? brand.accent : undefined}>
      <header className="public-top">
        <a className="wordmark" href="/">
          {brand?.logo ? <img className="logo" src={brand.logo} alt={company} /> : company}
        </a>
        <LanguageSwitch current={locale} label={label} back={back} />
      </header>
      <main className="public-main" id="main">{children}</main>
      <footer className="public-foot">
        {foot}
        {brand?.website && website && <a className="site-link" href={brand.website} rel="noopener">{website}</a>}
      </footer>
    </div>
  );
}
