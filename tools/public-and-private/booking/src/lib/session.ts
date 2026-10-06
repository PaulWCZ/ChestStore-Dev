import { catalogue, type Catalogue, type Locale } from "../i18n/index.ts";
import { pageLanguage, pageLanguages, type HostLanguages } from "./texts.ts";

// Who asks and in which words is the starter's (src/core/http.tsx): the
// member the Chest asserts on /chest (member(request), the only source of
// identity), the visitor's language elsewhere. What Booking adds:

// The language of a host's public page: the visitor's (`wanted`) when the
// host wrote their texts in it, otherwise the host's (lib/texts.ts);
// languages: those the page's switch offers.
export function hostWords(host: HostLanguages, wanted: Locale): { locale: Locale; t: Catalogue; languages: Locale[] } {
  const locale = pageLanguage(host, wanted);
  return { locale, t: catalogue(locale), languages: pageLanguages(host) };
}
