import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { languageNames } from "../lib/i18n/format.ts";
import { locales, type Locale } from "../lib/i18n/index.ts";
import { currentLook } from "../lib/theme.ts";

// The frame of the public pages: the company's name — or, when the
// company gave its brand in its Chest, its logo (with its dark variant on
// dark pages) and its colours and fonts (the root layout's look): the
// customer is on the company's own page — and the language switch. Never
// the Chest's name nor Support's mark: the customer talks to the company.
// Inside the company's own website (embed), no name: their page already
// says it.
//
// The switch links to /lang/<code> (app/lang/[code]/route.ts), which
// remembers the choice and comes back with ?lang=<code>. Each language is
// named in itself, never translated.
export async function PublicShell({ company, locale, label, back, children, foot, embed = false }: { company: string; locale: Locale; label: string; back: string; children: ReactNode; foot?: ReactNode; embed?: boolean }) {
  const look = await currentLook();
  const logo = look.source === "brand" && look.logo ? { ...look.logo, alt: company } : null;
  return (
    <div className={`public${embed ? " embed" : ""}`}>
      <header className="public-top">
        {embed ? <span /> : <span className="company">{logo ? <BrandMark logo={logo} /> : company}</span>}
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={label} back={back} />
      </header>
      <main className="public-main" id="main">{children}</main>
      {foot && <footer className="public-foot">{foot}</footer>}
    </div>
  );
}
