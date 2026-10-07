import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as notifications from "@argentic/chest-sdk/notifications";
import { catalogue, locales, type Catalogue } from "../i18n/index.ts";

// Items in the Chest's bell: one notice for all its recipients, in every
// language the tool speaks (studio.5: a notice's translations, announced
// for 0.5) — English its own title and body, French in translations; the
// Chest shows each member their language. A notification is a courtesy:
// when the Chest cannot take it (not granted, quota, unreachable), the
// action that sent it still succeeds. The Chest delivers it only to members
// who have the tool, and mails it to them by their own choice.
export async function notify(recipients: Iterable<string>, message: (t: Catalogue, locale: Locale) => { title: string; body?: string }, options: { path: string; key?: string }): Promise<void> {
  const ids = [...new Set(recipients)];
  if (ids.length === 0) return;
  const notice = translated(message, options);
  try {
    for (let i = 0; i < ids.length; i += 500) await notifications.notify(ids.slice(i, i + 500), notice);
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

// broadcast tells everyone of some roles in one call (Proposal (studio),
// announced for 0.5: notifications.broadcast) — the Chest finds them and
// shows each their language. On a Chest without it (or past its 30 an
// hour), the tool lists them itself (who()) and notifies them.
export async function broadcast(roles: readonly string[], who: () => Promise<string[]>, message: (t: Catalogue, locale: Locale) => { title: string; body?: string }, options: { path: string; key?: string }): Promise<void> {
  try {
    await notifications.broadcast(translated(message, options), { to: { roles: [...roles] } });
    return;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  await notify(await who(), message, options);
}

// translated is one notice in every language of the catalogues.
function translated(message: (t: Catalogue, locale: Locale) => { title: string; body?: string }, options: { path: string; key?: string }): notifications.Notice {
  const words = (locale: Locale) => {
    const { title, body } = message(catalogue(locale), locale);
    return { title: cut(title, 80), ...(body && body.trim() ? { body: cutLines(body, 280) } : {}) };
  };
  return {
    ...words("en"), path: options.path, ...(options.key ? { key: options.key } : {}),
    translations: Object.fromEntries(locales.filter(l => l !== "en").map(l => [l, words(l)])),
  };
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

// cutLines is cut for a notice's body: the Chest keeps its line breaks,
// so only the spaces within a line and the empty lines are folded.
export function cutLines(text: string, max: number): string {
  const lines = text.split(/\r?\n/u).map(line => line.replace(breakable, " ").trim()).filter(Boolean);
  const chars = [...lines.join("\n")];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("").trimEnd() + "…";
}

// White space folded to one space — but never a no-break space, which the
// French words and amounts carry on purpose ("20,50 €", « À valider »).
const breakable = /[^\S\u00a0\u2007\u202f]+/gu;

// cut shortens a text to max characters (not UTF-16 units), with an ellipsis.
export function cut(text: string, max: number): string {
  const chars = [...text.replace(breakable, " ").trim()];
  return chars.length <= max ? chars.join("") : chars.slice(0, max - 1).join("") + "…";
}
