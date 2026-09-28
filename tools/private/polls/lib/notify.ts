import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, type Catalogue } from "./i18n/index.ts";
import { people } from "./people.ts";

// Items in the Chest's bell, each written in its recipient's language. A
// notification is a courtesy: when the Chest cannot take it (not granted,
// quota, unreachable), the action that sent it still succeeds.
export async function notify(recipients: Iterable<string>, message: (t: Catalogue, locale: Locale) => { title: string; body?: string }, options: { path: string; key?: string }): Promise<void> {
  const ids = [...new Set(recipients)];
  if (ids.length === 0) return;
  const byLocale = new Map<Locale, string[]>();
  for (const person of (await people(ids)).values()) {
    if (person.status !== "member") continue;
    byLocale.set(person.locale, [...(byLocale.get(person.locale) ?? []), person.id]);
  }
  for (const [locale, group] of byLocale) {
    const { title, body } = message(catalogue(locale), locale);
    try {
      await notifications.notify(group, { title: cut(title, 80), ...(body ? { body: cut(body, 280) } : {}), path: options.path, ...(options.key ? { key: options.key } : {}) });
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

// cut shortens a text to max characters (not UTF-16 units), with an ellipsis.
export function cut(text: string, max: number): string {
  const chars = [...text.replace(/\s+/gu, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("") + "…";
}
