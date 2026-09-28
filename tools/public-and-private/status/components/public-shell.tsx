import type { ReactNode } from "react";
import type { Catalogue, Locale } from "../lib/i18n/index.ts";
import { format, zoneAbbreviation, zoneName } from "../lib/i18n/format.ts";
import { Calendar, Mail, Rss } from "./icons.tsx";
import { LanguageSwitch } from "./language-switch.tsx";
import { LocalTimes } from "./local-times.tsx";

// The frame of every public page: the company's name, the language switch
// and "Get updates" on top; the feeds, the history and the time zone below.
export function PublicShell({ company, locale, zone, t, path, offerMail, children }: { company: string; locale: Locale; zone: string; t: Catalogue; path: string; offerMail: boolean; children: ReactNode }) {
  const name = company || t.meta.publicPlain;
  const initial = [...name.trim()][0]?.toLocaleUpperCase(locale) ?? "";
  const note = format(t.time.zoneNote, { zone: `${zoneName(zone)} (${zoneAbbreviation(new Date(), zone, locale)})` });
  return (
    <div className="public">
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="public-head">
        <div className="wrap public-bar">
          <a className="company" href="/">
            <span className="monogram" aria-hidden="true">{initial}</span>
            <span className="company-name">{name}</span>
            {company && <span className="company-sub">{t.meta.name}</span>}
          </a>
          <div className="public-actions">
            {offerMail && <a className="button small" href="/subscribe"><Mail />{t.public.subscribe}</a>}
            <LanguageSwitch current={locale} label={t.public.language} back={path} />
          </div>
        </div>
      </header>
      <main id="main" className="wrap public-main">{children}</main>
      <footer className="wrap public-foot">
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
