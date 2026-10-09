import { ChestError } from "@argentic/chest-sdk/errors";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, defaultLocale, locales, type Catalogue, type Locale } from "../i18n/index.ts";

// Items in the Chest's inbox. One notice per call, written in every
// language the tool speaks: English is its own title and body (the
// fallback), the others ride in its translations, and the Chest shows each
// member their language — and mails it to them when they chose so (each
// one, once or twice a day, or off: the member's choice in the Chest, never
// the tool's). A notification is a courtesy: when the Chest cannot take it
// (not granted, quota, unreachable), the action that sent it still
// succeeds.
export type Words = { title: string; body?: string };

// notice writes the words of each language, bounded as the Chest wants
// them (a title of 80 characters, a body of 280).
export function notice(message: (t: Catalogue, locale: Locale) => Words): Words & { translations?: Partial<Record<Exclude<Locale, "en">, Words>> } {
  const words = (locale: Locale): Words => {
    const { title, body } = message(catalogue(locale), locale);
    return { title: cut(title, 80), ...(body && body.trim() ? { body: cutLines(body, 280) } : {}) };
  };
  const translations: Partial<Record<Exclude<Locale, "en">, Words>> = {};
  for (const locale of locales) if (locale !== defaultLocale) translations[locale as Exclude<Locale, "en">] = words(locale);
  return { ...words(defaultLocale), ...(Object.keys(translations).length > 0 ? { translations } : {}) };
}

export async function notify(recipients: Iterable<string>, message: (t: Catalogue, locale: Locale) => Words, options: { path: string; key?: string }): Promise<void> {
  const ids = [...new Set(recipients)].filter(id => id.startsWith("mbr_"));
  if (ids.length === 0) return;
  const words = notice(message);
  // notify takes 500 members a call.
  for (let i = 0; i < ids.length; i += 500) {
    try {
      await notifications.notify(ids.slice(i, i + 500), { ...words, path: options.path, ...(options.key ? { key: options.key } : {}) });
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
  }
}

export async function withdraw(key: string, members?: string[]): Promise<void> {
  try {
    await notifications.withdraw(key, members);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

// badges sets each member's count on the tool's tile (0 clears it).
export async function badges(counts: Map<string, number>): Promise<void> {
  const list = [...counts].map(([memberId, count]) => ({ memberId, count: Math.min(Math.max(count, 0), 9999) }));
  try {
    for (let i = 0; i < list.length; i += 500) await notifications.badge.setMany(list.slice(i, i + 500));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

// cutLines is cut for a notice's body: the Chest keeps its line breaks, so
// only the spaces within a line and the empty lines are folded.
export function cutLines(text: string, max: number): string {
  const lines = text.split(/\r?\n/u).map(line => line.replace(breakable, " ").trim()).filter(Boolean);
  const chars = [...lines.join("\n")];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("").trimEnd() + "…";
}

// White space folded to one space — but never a no-break space, which the
// French words and amounts carry on purpose ("20,50 €", « Fait », "85 %").
const breakable = /[^\S\u00a0\u2007\u202f]+/gu;

// cut shortens a text to one line of max characters (not UTF-16 units),
// with an ellipsis.
export function cut(text: string, max: number): string {
  const chars = [...text.replace(breakable, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("").trimEnd() + "…";
}
