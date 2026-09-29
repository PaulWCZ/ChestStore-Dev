import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import type { Brand } from "../lib/careers.ts";
import { languageNames, locales, type Locale } from "../lib/i18n/index.ts";
import { nonceOf } from "../lib/session.ts";
import { accentCss, currentLook } from "../lib/theme.ts";

// The frame of the careers pages: the company's name or logo (a link
// home), the language switch, the footer with a link to the company's
// website. Never the Chest's name: the candidate is visiting the company.
//
// Whose look wins (DESIGN.md, "Looks"):
// - the company's brand, chosen in its Chest, is the company speaking:
//   its colours are the page's (the root layout's style) and its logo,
//   with its dark variant, is the one shown — Hiring's own logo and
//   colour settings wait;
// - a theme of the catalogue gives the colours; the logo uploaded in
//   Hiring's settings stays (a theme has no logo);
// - Hiring's own look: its logo, and the colour chosen in its settings
//   (one of lib/theme.ts's accents, each a checked theme), scoped to
//   these pages.
export async function PublicShell({ company, locale, label, back, children, foot, brand, website }: { company: string; locale: Locale; label: string; back: string; children: ReactNode; foot: ReactNode; brand?: Brand; website?: string }) {
  const [look, h] = await Promise.all([currentLook(), headers()]);
  const accent = look.source === "own" && brand && brand.accent !== "cobalt" ? brand.accent : null;
  const own = brand?.logo ? <img className="logo" src={brand.logo} alt={company} /> : company;
  const mark = look.source === "brand" && look.logo ? <BrandMark logo={{ ...look.logo, alt: company }} /> : own;
  return (
    <div className={`public${accent ? " careers-accent" : ""}`}>
      {accent && <style nonce={nonceOf(h)} dangerouslySetInnerHTML={{ __html: accentCss(accent, ".careers-accent") }} />}
      <header className="public-top">
        <a className="wordmark" href="/">
          {mark}
        </a>
        <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] ?? code }))} current={locale} label={label} back={back} />
      </header>
      <main className="public-main" id="main">{children}</main>
      <footer className="public-foot">
        {foot}
        {brand?.website && website && <a className="site-link" href={brand.website} rel="noopener">{website}</a>}
      </footer>
    </div>
  );
}
