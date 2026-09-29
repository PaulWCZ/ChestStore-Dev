import * as chest from "@argentic/chest-sdk/chest";
import { isLocale, locales, type Locale } from "./i18n/index.ts";

// The language incidents are written in: the Chest's own (the company's),
// English when the Chest speaks one the tool does not. The second version
// an editor may add is in the tool's other language.
export function mainLanguage(): Locale {
  const given = chest.locale();
  return isLocale(given) ? given : "en";
}

export function otherLanguage(main: string = mainLanguage()): Locale {
  return locales.find(l => l !== main) ?? "en";
}
