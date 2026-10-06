import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, locales, type Catalogue } from "../i18n/index.ts";
import { people } from "./people.ts";

// Items in the Chest's bell. A notice is written once in every language
// Polls speaks — English the fallback, the others as its translations —
// and the Chest shows each member theirs (Proposal (studio), announced for
// 0.5). The Chest mails members their notifications by each member's
// choice: Polls never mails a member. A notification is a courtesy: when
// the Chest cannot take it (not granted, quota, unreachable), the action
// that sent it still succeeds.
export type Words = (t: Catalogue, locale: Locale) => { title: string; body?: string };

// notice: the words in English, with the other languages as translations.
export function notice(message: Words, options: { path: string; key?: string }): notifications.Notice {
  const shaped = (locale: Locale) => {
    const { title, body } = message(catalogue(locale), locale);
    return { title: cut(title, 80), ...(body ? { body: cut(body, 280) } : {}) };
  };
  const translations = Object.fromEntries(locales.filter(l => l !== "en").map(l => [l, shaped(l)]));
  return { ...shaped("en"), path: options.path, ...(options.key ? { key: options.key } : {}), translations };
}

// The Chest takes 500 recipients a call (0.4.1).
const perCall = 500;

// sendNotice: these members (already known to have Polls) hear of it.
// False when the Chest refused: the caller may try again later.
export async function sendNotice(ids: readonly string[], value: notifications.Notice): Promise<boolean> {
  try {
    for (let i = 0; i < ids.length; i += perCall) await notifications.notify(ids.slice(i, i + perCall), value);
    return true;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return false;
  }
}

// notify: those of these members who still have Polls hear of it.
export async function notify(recipients: Iterable<string>, message: Words, options: { path: string; key?: string }): Promise<void> {
  const ids = [...new Set(recipients)];
  if (ids.length === 0) return;
  const current = [...(await people(ids)).values()].filter(p => p.status === "member").map(p => p.id);
  if (current.length > 0) await sendNotice(current, notice(message, options));
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
