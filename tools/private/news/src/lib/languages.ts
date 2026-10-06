import { catalogue, locales, type Locale } from "../i18n/index.ts";

// The languages a post may be written in: the store's, each named in
// itself ("English", "Français") — a reader looks for their own.
// said: its name in a sentence of the viewer's language ("a French version").
export function composerLanguages(viewer: Locale): { code: string; name: string; said: string }[] {
  const t = catalogue(viewer);
  return locales.map(code => ({ code, name: catalogue(code).tool.language, said: t.languageNames[code] }));
}
