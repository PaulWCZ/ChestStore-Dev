// @argentic/chest-sdk/member as the studio publishes it: 0.4.1's module,
// unchanged (every name below is the official one, the same value), and the
// studio's languages helper.
export * from "../src/member.js";

// ---- Studio proposal (not in 0.4.1) -----------------------------------------
//
// The languages the store's tools speak today, the first one the default and
// fallback. member.language is any language the Chest speaks — a tool
// narrows it to one of its catalogues with localeOf, so that a language
// added to the Chest before the tool translates it reads as English rather
// than as nothing (0.4.1's README: "a tool that does not speak it uses its
// own default"). The studio's modules that take words in several languages
// (notifications.broadcast, calendar, visitors.language) are typed on them.
export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];

// localeOf is the store's language for a language tag ("fr", "fr-FR", "FR"):
// its primary subtag when the store speaks it, English otherwise — also for
// anything that is not a tag.
//
//   const t = catalogue[localeOf(who.language)];
export function localeOf(tag: unknown): Locale {
  if (typeof tag !== "string" || tag.length > 35) return locales[0];
  const primary = tag.split(/[-_]/u)[0]!.toLowerCase();
  return (locales as readonly string[]).includes(primary) ? primary as Locale : locales[0];
}
