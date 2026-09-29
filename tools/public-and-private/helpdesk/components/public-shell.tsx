import type { ReactNode } from "react";
import type { Locale } from "../lib/i18n/index.ts";
import { LanguageSwitch } from "./language-switch.tsx";

// The frame of the public pages: the company's name, the language switch.
// Never the Chest's name: the customer talks to the company. Inside the
// company's own website (embed), no name: their page already says it.
export function PublicShell({ company, locale, label, back, children, foot, embed = false }: { company: string; locale: Locale; label: string; back: string; children: ReactNode; foot?: ReactNode; embed?: boolean }) {
  return (
    <div className={`public${embed ? " embed" : ""}`}>
      <header className="public-top">
        <span className="company">{embed ? "" : company}</span>
        <LanguageSwitch current={locale} label={label} back={back} />
      </header>
      <main className="public-main" id="main">{children}</main>
      {foot && <footer className="public-foot">{foot}</footer>}
    </div>
  );
}
