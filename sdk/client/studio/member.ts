// @argentic/chest-sdk/member as the studio publishes it (0.7.0-studio.N):
// 0.7.0's module — member(), Member, the patterns, every name the same value
// — and the studio's languages helper.
//
// What 0.7.0 now gives, the studio dropped: its own member() (studio.7),
// which read a member in any number of groups, and maxAssertionLength.
// 0.7.0's member() reads any number of groups too, and a member in more
// than an assertion carries (about 150) arrives with groups null (the
// Chest's "groups overage"): read them with members.get(member.id).
export * from "../src/member.js";

// ---- Studio proposal (not in 0.7.0) -----------------------------------------
//
// The languages the store's tools speak today, the first one the default and
// fallback. member.language is any language the Chest speaks — a tool
// narrows it to one of its catalogues with localeOf, so that a language
// added to the Chest before the tool translates it reads as English rather
// than as nothing (0.7.0's README: "a tool that does not speak that language
// uses its own default"). The studio's modules that take words in several
// languages (calendar, visitors.language) are typed on them.
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
