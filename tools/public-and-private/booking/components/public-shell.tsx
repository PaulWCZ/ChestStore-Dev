import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { languageNames } from "../lib/i18n/format.ts";
import { locales as all, type Locale } from "../lib/i18n/index.ts";
import { currentLook } from "../lib/theme.ts";

// The frame of the public pages: the company — its logo when the Chest
// gives its brand, else its name — and the language switch (each language
// named in itself; a host's page offers only the languages its host wrote
// in, and no switch when there is one). Never the Chest's name: the customer talks to the
// company, and in brand mode the page is the company's own.
export async function PublicShell({ company, locale, label, back, children, foot, languages = all }: { company: string; locale: Locale; label: string; back: string; children: ReactNode; foot?: ReactNode; languages?: readonly Locale[] }) {
  const look = await currentLook();
  return (
    <div className="public">
      <header className="public-top">
        <span className="company"><BrandMark logo={look.logo}>{company}</BrandMark></span>
        {languages.length > 1 && <LanguageSwitch languages={languages.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={label} back={back} />}
      </header>
      <main className="public-main" id="main">{children}</main>
      {foot && <footer className="public-foot">{foot}</footer>}
    </div>
  );
}
