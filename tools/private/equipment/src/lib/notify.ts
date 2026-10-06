import { ChestError } from "@argentic/chest-sdk/errors";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, defaultLocale, locales, type Catalogue, type Locale } from "../i18n/index.ts";

// Items in the Chest's bell. One notice per moment, in every language of
// the tool: English is its own title and body (the fallback), the others
// its translations — the Chest shows each member theirs (SDK
// 0.4.1-studio.5). The Chest also mails members their notifications, by
// each member's choice: Equipment never mails a member itself. A
// notification is a courtesy: when the Chest cannot take it (not granted,
// quota, unreachable), the action that sent it still succeeds.
type Words = { title: string; body?: string };

export function notice(message: (t: Catalogue, locale: Locale) => Words, options: { path: string; key?: string }): notifications.Notice {
  const words = (locale: Locale): Words => {
    const { title, body } = message(catalogue(locale), locale);
    return { title: cut(title, 80), ...(body ? { body: cut(body, 280) } : {}) };
  };
  const translations: Record<string, Words> = {};
  for (const locale of locales) if (locale !== defaultLocale) translations[locale] = words(locale);
  return { ...words(defaultLocale), path: options.path, ...(options.key ? { key: options.key } : {}), translations: translations as notifications.Translations };
}

export async function notify(recipients: Iterable<string>, message: (t: Catalogue, locale: Locale) => Words, options: { path: string; key?: string }): Promise<void> {
  const ids = [...new Set(recipients)].filter(id => id.startsWith("mbr_"));
  if (ids.length === 0) return;
  const n = notice(message, options);
  try {
    // The Chest takes 500 members a call; it skips those without the tool.
    for (let i = 0; i < ids.length; i += 500) await notifications.notify(ids.slice(i, i + 500), n);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
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

// cut shortens a text to max characters (not UTF-16 units), with an ellipsis.
export function cut(text: string, max: number): string {
  const chars = [...text.replace(/\s+/gu, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("") + "…";
}
