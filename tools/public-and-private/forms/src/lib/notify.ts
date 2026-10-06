import { ChestError } from "@argentic/chest-sdk/errors";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, defaultLocale, locales, type Catalogue, type Locale } from "../i18n/index.ts";

// Items in the Chest's bell. One notice for all the recipients: English
// words (the fallback) and their translations from the tool's own
// catalogues; the Chest shows each member their language and mails it to
// them by their own choice (the tool sends members no mail). A
// notification is a courtesy: when the Chest cannot take it (not granted,
// quota, unreachable), the action that sent it still succeeds.
export async function notify(recipients: Iterable<string>, message: (t: Catalogue, locale: Locale) => { title: string; body?: string }, options: { path: string; key?: string }): Promise<void> {
  const ids = [...new Set(recipients)];
  if (ids.length === 0) return;
  try {
    // 500 recipients a call at most (0.4.1's notify).
    for (let i = 0; i < ids.length; i += 500) await notifications.notify(ids.slice(i, i + 500), notice(message, options));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

// notice: the English words, their translations, the path and the key.
export function notice(message: (t: Catalogue, locale: Locale) => { title: string; body?: string }, options: { path: string; key?: string }): notifications.Notice {
  const words = (locale: Locale) => {
    const { title, body } = message(catalogue(locale), locale);
    const b = body ? cut(body, 280) : "";
    return { title: cut(title, 80), ...(b ? { body: b } : {}) };
  };
  const translations = Object.fromEntries(locales.filter(l => l !== defaultLocale).map(l => [l, words(l)])) as notifications.Translations;
  return { ...words(defaultLocale), path: options.path, ...(options.key ? { key: options.key } : {}), translations };
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

// cut shortens a text to max characters (not UTF-16 units), with an ellipsis.
export function cut(text: string, max: number): string {
  const chars = [...text.replace(/\s+/gu, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("") + "…";
}
