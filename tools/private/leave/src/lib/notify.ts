import { ChestError } from "@argentic/chest-sdk/errors";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, defaultLocale, locales, type Catalogue, type Locale } from "../i18n/index.ts";

// Items in the Chest's bell. Each notice is written once in English (the
// fallback) with the same words in every other language of the tool as
// translations (Proposal (studio), announced for 0.5): the Chest shows
// each member theirs, and mails members their notifications by their own
// choice in the Chest — Leave mails no member. A notification is a
// courtesy: when the Chest cannot take it (not granted, quota,
// unreachable), the action that sent it still succeeds.
type Words = { title: string; body?: string };

export function notice(message: (t: Catalogue, locale: Locale) => Words, options: { path: string; key?: string }): notifications.Notice {
  const words = (locale: Locale): Words => {
    const { title, body } = message(catalogue(locale), locale);
    return { title: cut(title, 80), ...(body && body.trim() ? { body: cutLines(body, 280) } : {}) };
  };
  const translations: Record<string, Words> = {};
  for (const locale of locales) if (locale !== defaultLocale) translations[locale] = words(locale);
  return { ...words(defaultLocale), path: options.path, ...(options.key ? { key: options.key } : {}), translations };
}

// notify tells these members, 500 to a call (notify's bound).
export async function notify(recipients: Iterable<string>, message: (t: Catalogue, locale: Locale) => Words, options: { path: string; key?: string }): Promise<void> {
  const ids = [...new Set(recipients)].filter(id => id.startsWith("mbr_"));
  if (ids.length === 0) return;
  const written = notice(message, options);
  // One chunk the Chest refuses does not keep the others from it.
  for (let i = 0; i < ids.length; i += 500) {
    try {
      await notifications.notify(ids.slice(i, i + 500), written);
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
  // One chunk the Chest refuses does not keep the others from it.
  for (let i = 0; i < list.length; i += 500) {
    try {
      await notifications.badge.setMany(list.slice(i, i + 500));
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
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
// French words and amounts carry on purpose ("20,50 €", « Fait »).
const breakable = /[^\S\u00a0\u2007\u202f]+/gu;

// cut shortens a text to one line of max characters (not UTF-16 units),
// with an ellipsis.
export function cut(text: string, max: number): string {
  const chars = [...text.replace(breakable, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("").trimEnd() + "…";
}
