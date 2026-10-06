import { Island } from "@argentic/chest-app";
import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Calendar, External, Mail, Rss } from "../../components/icons.tsx";
import { format, zoneAbbreviation, zoneName } from "../../i18n/format.ts";
import { languageNames, locales } from "../../i18n/index.ts";
import type { PublicContext } from "../../lib/public-page.ts";
import { siteName } from "../../lib/page-settings.ts";

// The frame of every public page: the company's name (or its logo, when the
// Chest holds its brand), the language switch and "Get updates" on top; the
// company's website and support, the feeds, the history and the time zone
// below. Each public page draws it from what it read (lib/public-page.ts:
// the page's settings, the look — the company's brand, set once in its
// Chest, dresses the public page too). The times in the page are written
// in the Chest's zone, then in the visitor's (the LocalTimes island).
export function PublicShell({ context, path, offerMail, children }: { context: PublicContext; path: string; offerMail: boolean; children: ReactNode }) {
  const { company, locale, zone, t, settings, look } = context;
  const name = company || t.meta.publicPlain;
  const initial = [...name.trim()][0]?.toLocaleUpperCase(locale) ?? "";
  const note = format(t.time.zoneNote, { zone: `${zoneName(zone)} (${zoneAbbreviation(new Date(), zone, locale)})` });
  const site = settings.website ? siteName(settings.website) : null;
  return (
    <div className={`public${look.source === "brand" ? " branded" : ""}`} data-look={look.source}>
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
      <Island name="LocalTimes" props={{ locale, note: t.time.zoneNote }} />
    </div>
  );
}
