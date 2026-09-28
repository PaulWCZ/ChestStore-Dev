import { locales, type Locale } from "../lib/i18n/index.ts";

// The visible language switch of the public part: links to /lang/<code>,
// which remembers the choice in a cookie and comes back. Each language is
// named in itself, never translated.
const selfNames: Record<Locale, string> = { en: "English", fr: "Français" };

export function LanguageSwitch({ current, label, back = "/" }: { current: Locale; label: string; back?: string }) {
  return (
    <nav className="languages" aria-label={label}>
      {locales.map(code => (
        <a key={code} href={`/lang/${code}?back=${encodeURIComponent(back)}`} hrefLang={code} lang={code} aria-current={code === current ? "true" : undefined}>
          {selfNames[code]}
        </a>
      ))}
    </nav>
  );
}
