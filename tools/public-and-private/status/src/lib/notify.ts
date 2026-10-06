import { ChestError } from "@argentic/chest-sdk/errors";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, locales, type Catalogue, type Locale } from "../i18n/index.ts";

// A notice in every language the tool speaks, in one call (studio.5: a
// notice's translations, announced for 0.5): English is its own title and
// body (the fallback), the others go in translations; the Chest shows each
// member their language. Bounded as the Chest bounds them (80, 280).
export type Words = { title: string; body?: string };
export function notice(words: (t: Catalogue, locale: Locale) => Words, options: { path: string; key?: string }): notifications.Notice {
  const shaped = (locale: Locale): Words => {
    const w = words(catalogue(locale), locale);
    return { title: cut(w.title, 80), ...(w.body ? { body: cut(w.body, 280) } : {}) };
  };
  const translations = Object.fromEntries(locales.filter(l => l !== "en").map(l => [l, shaped(l)]));
  return { ...shaped("en"), path: options.path, ...(options.key ? { key: options.key } : {}), translations };
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
// Runs of ordinary spaces and line breaks become one space; the no-break
// spaces French puts before ":" stay (JavaScript's \s would take them too).
export function cut(text: string, max: number): string {
  const chars = [...text.replace(/[ \t\n\r\f\v]+/gu, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("") + "…";
}
