// Texts written in two languages: the one the incident was posted in, and
// an optional second version. Each visitor reads the version in their
// language when there is one, the first otherwise — marked with its own
// language (the lang attribute), so a screen reader pronounces it right.
// Pure: safe in the browser.

export type Picked = { text: string; lang: string };

export function pick(first: string, second: string | null | undefined, languages: { language: string; secondLanguage: string | null }, locale: string): Picked {
  if (second && languages.secondLanguage === locale) return { text: second, lang: locale };
  return { text: first, lang: languages.language };
}
