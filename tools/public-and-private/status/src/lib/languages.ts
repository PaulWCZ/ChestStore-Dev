import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { AppError } from "./app-error.ts";
import { isLocale, locales, type Locale } from "../i18n/index.ts";

// The languages of an incident's texts.
//
// An incident is written in the language its editor writes in — not the
// Chest's: a French editor on an English-speaking Chest writes French, and
// her text is served, marked and mailed as French. The form offers a
// "Written in" choice, set to the editor's own language (the Chest gives
// it: member.language); the optional second version is in the tool's other
// language.

// chestLanguage is the company's language (the Chest's), English when the
// Chest speaks one the tool does not. Used only where no one wrote the
// text: the API's fixed descriptions, imported incidents, and old rows
// stored before an incident kept its language.
export function chestLanguage(): Locale {
  const given = chest.language;
  return isLocale(given) ? given : "en";
}

// writerLanguage is the language an editor writes in by default: theirs
// when the tool speaks it, else the Chest's.
export function writerLanguage(actor: Pick<Member, "language"> | null): Locale {
  return actor && isLocale(actor.language) ? actor.language : chestLanguage();
}

// writtenIn reads the "Written in" choice of a form: one of the tool's
// languages, or the editor's own when none is given. Anything else is
// refused (the form never sends it).
export function writtenIn(given: unknown, actor: Pick<Member, "language"> | null): Locale {
  if (given === undefined || given === null || given === "") return writerLanguage(actor);
  if (!isLocale(given)) throw new AppError("invalid");
  return given;
}

// otherLanguage is the language of the second version beside a text
// written in `main`.
export function otherLanguage(main: string): Locale {
  return locales.find(l => l !== main) ?? "en";
}
