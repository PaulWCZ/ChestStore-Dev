import { locales, type Locale } from "../lib/i18n/index.ts";

// The visible language switch of the public part: links to /lang/<code>,
// which remembers the choice in a cookie and comes back. Each language is
// named in itself, never translated.
const selfNames: Record<Locale, string> = { en: "English", fr: "Français" };

// `only`: the languages a form is written in (a form in one language
// shows no switch: its page speaks that language).
export function LanguageSwitch({ current, label, back = "/", only }: { current: Locale; label: string; back?: string; only?: readonly Locale[] }) {
  const shown = locales.filter(code => !only || only.includes(code));
  if (shown.length < 2) return null;
  return (
    <nav className="languages" aria-label={label}>
      {shown.map(code => (
        <a key={code} href={`/lang/${code}?back=${encodeURIComponent(back)}`} hrefLang={code} lang={code} aria-current={code === current ? "true" : undefined}>
          {selfNames[code]}
        </a>
      ))}
    </nav>
  );
}
