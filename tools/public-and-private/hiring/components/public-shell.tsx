import type { ReactNode } from "react";
import type { Locale } from "../lib/i18n/index.ts";
import { LanguageSwitch } from "./language-switch.tsx";

// The frame of the careers pages: the company's name (a link home), the
// language switch, the footer. Never the Chest's name: the candidate is
// visiting the company.
export function PublicShell({ company, locale, label, back, children, foot }: { company: string; locale: Locale; label: string; back: string; children: ReactNode; foot: ReactNode }) {
  return (
    <div className="public">
      <header className="public-top">
        <a className="wordmark" href="/">{company}</a>
        <LanguageSwitch current={locale} label={label} back={back} />
      </header>
      <main className="public-main" id="main">{children}</main>
      <footer className="public-foot">{foot}</footer>
    </div>
  );
}
