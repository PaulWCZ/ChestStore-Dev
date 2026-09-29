import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { db } from "../lib/db.ts";
import { languageNames, locales, type Catalogue, type Locale } from "../lib/i18n/index.ts";
import { format, zoneAbbreviation, zoneName } from "../lib/i18n/format.ts";
import { pageSettings, siteName } from "../lib/page-settings.ts";
import { currentLook } from "../lib/theme.ts";
import { Calendar, External, Mail, Rss } from "./icons.tsx";
import { LocalTimes } from "./local-times.tsx";

// The frame of every public page: the company's name (or its logo, when the
// Chest holds its brand), the language switch and "Get updates" on top; the
// company's website and support, the feeds, the history and the time zone
// below. A server component: it reads the page's settings and the look —
// the same look as the team's pages (app/layout.tsx), so the company's
// brand, set once in its Chest, dresses the public page too.
export async function PublicShell({ company, locale, zone, t, path, offerMail, children }: { company: string; locale: Locale; zone: string; t: Catalogue; path: string; offerMail: boolean; children: ReactNode }) {
  const name = company || t.meta.publicPlain;
  const initial = [...name.trim()][0]?.toLocaleUpperCase(locale) ?? "";
  const note = format(t.time.zoneNote, { zone: `${zoneName(zone)} (${zoneAbbreviation(new Date(), zone, locale)})` });
  const [settings, look] = await Promise.all([pageSettings(db()), currentLook()]);
  const site = settings.website ? siteName(settings.website) : null;
  return (
    <div className={`public${look.source === "brand" ? " branded" : ""}`}>
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      <header className="public-head">
        <div className="wrap public-bar">
          <a className="company" href="/">
            {look.logo ? (
              <BrandMark logo={{ ...look.logo, alt: look.logo.alt || name }} />
            ) : (
              <>
                <span className="monogram" aria-hidden="true">{initial}</span>
                <span className="company-name">{name}</span>
              </>
            )}
            {company && <span className="company-sub">{t.meta.name}</span>}
          </a>
          <div className="public-actions">
            {site && settings.website && <a className="back-site" href={settings.website} rel="noopener">{format(t.public.backTo, { site })}<External /></a>}
            {offerMail && <a className="button small" href="/subscribe"><Mail />{t.public.subscribe}</a>}
            <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] }))} current={locale} label={t.public.language} back={path} />
          </div>
        </div>
      </header>
      <main id="main" className="wrap public-main">{children}</main>
      <footer className="wrap public-foot">
        {(settings.website || settings.support) && (
          <nav aria-label={t.public.companySite} className="foot-links">
            {site && settings.website && <a href={settings.website} rel="noopener">{site}</a>}
            {settings.support && <a href={settings.support} rel="noopener">{t.public.support}</a>}
          </nav>
        )}
        <nav aria-label={t.public.feeds} className="foot-links">
          <a href="/history">{t.public.history}</a>
          {offerMail && <a href="/subscribe"><Mail />{t.public.subscribe}</a>}
          <a href="/feed.rss"><Rss />{t.public.rss}</a>
          <a href="/feed.atom"><Rss />{t.public.atom}</a>
          <a href="/maintenance.ics"><Calendar />{t.public.calendar}</a>
        </nav>
        <p className="zone-note" data-zone-note="">{note}</p>
      </footer>
      <LocalTimes locale={locale} note={t.time.zoneNote} />
    </div>
  );
}
