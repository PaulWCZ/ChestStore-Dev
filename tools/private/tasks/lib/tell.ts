import type { Member } from "@argentic/chest-sdk/member";
import { urgentCounts } from "./cards.ts";
import type { Sql } from "./db.ts";
import { format } from "./i18n/index.ts";
import { email } from "./mail.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { settle } from "./reminders.ts";

// What Tasks tells people through the Chest's bell, each in their own
// language, and the number on its tile. A notification is keyed by the card
// and its reason, so a new one replaces the old one instead of piling up.
// Given the database (sql), being given a card or a step and being
// mentioned also go by email (lib/mail.ts), to those who did not turn it
// off.
const cardPath = (boardId: string, cardId: string) => `/chest/boards/${boardId}?card=${cardId}`;

export async function assigned(actor: Member, people: string[], card: { id: string; title: string; boardId: string }, sql?: Sql): Promise<void> {
  const others = people.filter(p => p !== actor.id);
  if (others.length === 0) return;
  await notify(others, t => ({ title: format(t.bell.assigned, { name: actor.name }), body: cut(card.title, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:assigned` });
  if (sql) await email(sql, others, t => ({ subject: format(t.mail.assigned, { name: actor.name, card: cut(card.title, 80) }), lines: [format(t.mail.assignedLine, { name: actor.name }), "", card.title] }), { path: cardPath(card.boardId, card.id), key: `a:${card.id}` });
}

// A step of a checklist given to someone: a subtask.
export async function stepAssigned(actor: Member, person: string, step: { id: string; text: string }, card: { id: string; title: string; boardId: string }, sql?: Sql): Promise<void> {
  if (person === actor.id) return;
  await notify([person], t => ({ title: format(t.bell.stepAssigned, { name: actor.name, card: cut(card.title, 40) }), body: cut(step.text, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:step:${step.id}` });
  if (sql) await email(sql, [person], t => ({ subject: format(t.mail.stepAssigned, { name: actor.name, card: cut(card.title, 80) }), lines: [format(t.mail.stepLine, { name: actor.name, card: card.title }), "", step.text] }), { path: cardPath(card.boardId, card.id), key: `s:${step.id}` });
}

export async function unassigned(people: string[], cardId: string): Promise<void> {
  if (people.length > 0) await withdraw(`card:${cardId}:assigned`, people);
}

export async function mentioned(actor: Member, people: string[], card: { id: string; title: string; boardId: string }, body: string, sql?: Sql, commentId?: string): Promise<void> {
  if (people.length === 0) return;
  await notify(people, t => ({ title: format(t.bell.mentioned, { name: actor.name, card: cut(card.title, 40) }), body: cut(body, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:mention` });
  if (sql) await email(sql, people, t => ({ subject: format(t.bell.mentioned, { name: actor.name, card: cut(card.title, 80) }), lines: [format(t.mail.mentionLine, { name: actor.name, card: card.title }), "", body] }), { path: cardPath(card.boardId, card.id), key: `m:${commentId ?? card.id}` });
}

export async function commented(actor: Member, people: string[], card: { id: string; title: string; boardId: string }, body: string): Promise<void> {
  if (people.length === 0) return;
  await notify(people, t => ({ title: format(t.bell.commented, { name: actor.name, card: cut(card.title, 40) }), body: cut(body, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:comment` });
}

// A step ticked, taken from someone or removed no longer asks anything.
export async function stepSettled(cardId: string, itemId: string): Promise<void> {
  await withdraw(`card:${cardId}:step:${itemId}`);
}

// A card that is done or archived no longer asks anything of anyone.
export async function settled(cardId: string): Promise<void> {
  for (const reason of ["assigned", "mention", "comment"]) await withdraw(`card:${cardId}:${reason}`);
}

// refreshBadges sets the tile's number of these members: their late or
// due-today tasks; with none left, their morning reminder is taken back.
export async function refreshBadges(sql: Sql, people: string[]): Promise<void> {
  const unique = [...new Set(people)].filter(p => p.startsWith("mbr_"));
  if (unique.length === 0) return;
  const counts = await urgentCounts(sql, unique);
  await badges(counts);
  // Nothing late or due today any more: the morning's reminder goes.
  await settle(sql, [...counts].filter(([, n]) => n === 0).map(([m]) => m));
}
