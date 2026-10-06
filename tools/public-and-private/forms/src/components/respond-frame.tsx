import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import type { ReactNode } from "react";
import { locales, type Locale } from "../i18n/index.ts";
import type { Accent } from "../shared/model.ts";

// The frame of a respondent's page: the form's colour on its page (its
// ground in Forms' own look, src/tokens.css), the company's name — or its
// logo when the company gave the Chest its brand (the look's logo,
// src/lib/theme.ts) —, the language switch on the public host, a footer that
// says where answers go. Never the Chest's name: the visitor answers the
// company.
export function RespondFrame({ accent, company, logo, locale, languages, languageLabel, back, footer, aside, children }: { accent: Accent; company: string; logo?: { readonly url: string; readonly alt?: string; readonly dark?: string | null } | null; locale?: Locale; languages?: readonly Locale[]; languageLabel?: string; back?: string; footer: string; aside?: ReactNode; children: ReactNode }) {
  // `languages`: the ones a form is written in (a form in one language
  // shows no switch: its page speaks that language).
  const shown = storeLanguages.filter(l => (locales as readonly string[]).includes(l.code) && (!languages || (languages as readonly string[]).includes(l.code)));
  return (
    <div className="respond-page" data-accent={accent} lang={locale}>
      <div className="respond-glow" aria-hidden="true" />
      <header className="respond-top">
        {logo ? <BrandMark logo={{ ...logo, alt: company }} /> : <span className="respond-company">{company}</span>}
        {locale && languageLabel && shown.length > 1 && <LanguageSwitch languages={shown} current={locale} label={languageLabel} back={back ?? "/"} />}
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
