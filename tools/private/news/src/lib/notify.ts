import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, locales, type Catalogue } from "../i18n/index.ts";
import { people } from "./people.ts";

// Items in the Chest's bell. A notice is written once in every language
// News speaks — English the fallback, the others as its translations
// (Proposal (studio), announced for 0.5) — and the Chest shows each member
// theirs. The Chest emails members their notifications by each member's
// choice: News never emails a member. A notification is a courtesy: when
// the Chest cannot take it (not granted, quota, unreachable), the action
// that sent it still succeeds.
export type Words = (t: Catalogue, locale: Locale) => { title: string; body?: string };

// notice: the words in English, with the other languages as translations.
export function notice(message: Words, options: { path: string; key?: string }): notifications.Notice {
  const shaped = (locale: Locale) => {
    const { title, body } = message(catalogue(locale), locale);
    return { title: cut(title, 80), ...(body ? { body: cutLines(body, 280) } : {}) };
  };
  const translations = Object.fromEntries(locales.filter(l => l !== "en").map(l => [l, shaped(l)]));
  return { ...shaped("en"), path: options.path, ...(options.key ? { key: options.key } : {}), translations };
}

// The Chest takes 500 recipients a call (0.4.1).
export const perCall = 500;

// notify: those of these members who still have News hear of it.
export async function notify(recipients: Iterable<string>, message: Words, options: { path: string; key?: string }): Promise<void> {
  const ids = [...new Set(recipients)];
  if (ids.length === 0) return;
  const current = [...(await people(ids)).values()].filter(p => p.status === "member").map(p => p.id);
  const value = notice(message, options);
  try {
    for (let i = 0; i < current.length; i += perCall) await notifications.notify(current.slice(i, i + perCall), value);
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
