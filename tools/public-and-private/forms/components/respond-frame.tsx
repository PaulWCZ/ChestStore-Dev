import type { ReactNode } from "react";
import type { Accent } from "../lib/model.ts";
import type { Locale } from "../lib/i18n/index.ts";
import { LanguageSwitch } from "./language-switch.tsx";

// The frame of a respondent's page: the form's colour as a soft ground, the
// company's name, the language switch on the public host, a footer that
// says where answers go. Never the Chest's name: the visitor answers the
// company.
// The company's logo when its Chest gives one (the brand the owner chose,
// chest.theme(): lib/brand.ts), its name otherwise.
export function RespondFrame({ accent, company, logo, locale, languages, languageLabel, back, footer, aside, children }: { accent: Accent; company: string; logo?: { url: string; dark: string | null } | null; locale?: Locale; languages?: readonly Locale[]; languageLabel?: string; back?: string; footer: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="respond-page" data-accent={accent} lang={locale}>
      <div className="respond-glow" aria-hidden="true" />
      <header className="respond-top">
        {logo ? (
          <picture className="respond-logo">
            {logo.dark && <source media="(prefers-color-scheme: dark)" srcSet={logo.dark} />}
            <img src={logo.url} alt={company} />
          </picture>
        ) : <span className="respond-company">{company}</span>}
        {locale && languageLabel && <LanguageSwitch current={locale} label={languageLabel} back={back ?? "/"} only={languages} />}
        {aside}
      </header>
      <main className="respond-main" id="main">{children}</main>
      <footer className="respond-foot">{footer}</footer>
    </div>
  );
}

// A respondent's page that has nothing to answer: closed, already answered,
// unknown.
export function RespondNotice({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <section className="runner runner-notice" role="status">
      <h1 className="runner-title">{title}</h1>
      <p className="runner-lede">{body}</p>
      {children}
    </section>
  );
}
