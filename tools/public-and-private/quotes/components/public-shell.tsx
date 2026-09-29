import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { languageNames } from "../lib/i18n/format.ts";
import { locales, type Locale } from "../lib/i18n/index.ts";
import { publicLook } from "../lib/theme.ts";

// The frame of the public pages: the company — its logo when the Chest
// gives its brand, else its name — and the language switch (each language
// named in itself). Never the Chest's name: the client talks to the
// company.
export async function PublicShell({ company, locale, label, back, children, foot }: { company: string; locale: Locale; label: string; back: string; children: ReactNode; foot?: ReactNode }) {
  const look = await publicLook();
  return (
    <div className="public-frame">
      <header className="public-top">
        <span className="company"><BrandMark logo={look.logo}>{company}</BrandMark></span>
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={label} back={back} />
      </header>
      <main className="public-main" id="main">{children}</main>
      {foot && <footer className="public-foot">{foot}</footer>}
    </div>
  );
}
