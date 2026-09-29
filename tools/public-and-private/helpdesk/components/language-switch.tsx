import { languageNames } from "../lib/i18n/format.ts";
import { locales, type Locale } from "../lib/i18n/index.ts";

// The visible language switch of the public part: links to /lang/<code>,
// which remembers the choice in a cookie and comes back to the page with
// ?lang=<code> (a frame in another website may not keep cookies). Each
// language is named in itself, never translated (lib/i18n/format.ts).
const withLang = (back: string, code: string) => {
  const [path = "/", query = ""] = back.split("?");
  const params = new URLSearchParams(query);
  params.set("lang", code);
  return `${path}?${params.toString()}`;
};

export function LanguageSwitch({ current, label, back = "/" }: { current: Locale; label: string; back?: string }) {
  return (
    <nav className="languages" aria-label={label}>
      {locales.map(code => (
        <a key={code} href={`/lang/${code}?back=${encodeURIComponent(withLang(back, code))}`} hrefLang={code} lang={code} aria-current={code === current ? "true" : undefined}>
          {languageNames[code]}
        </a>
      ))}
    </nav>
  );
}
