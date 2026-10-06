import type { Member } from "@argentic/chest-sdk/member";
import { urgentCounts } from "./cards.ts";
import type { Sql } from "./db.ts";
import { format } from "../i18n/index.ts";
import type { CommentRef } from "./cards.ts";
import { queue } from "./mail.ts";
import { people } from "./people.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { settle } from "./reminders.ts";

// What Tasks tells people through the Chest's bell, each in their own
// language, and the number on its tile. A notification is keyed by the card
// and its reason, so a new one replaces the old one instead of piling up.
// Given the database (sql), being given a card or a step and being
// mentioned also go by email (lib/mail.ts: held a minute, grouped per
// person, read again as they leave), to those who did not turn it off.
// A comment's items remember which comment they show (comment_notices):
// deleted, the comment takes them back; edited, they say the new words.
// A card's address by its id alone (app/chest/cards/[id]): it opens on the
// board the card is on when it is clicked, so a bell item or an email
// still leads to it after the card moved to another board.
const cardPath = (_boardId: string, cardId: string) => `/chest/cards/${cardId}`;

export async function assigned(actor: Member, people: string[], card: { id: string; title: string; boardId: string }, sql?: Sql): Promise<void> {
  const others = people.filter(p => p !== actor.id);
  if (others.length === 0) return;
  await notify(others, t => ({ title: format(t.bell.assigned, { name: actor.name }), body: cut(card.title, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:assigned` });
  if (sql) await queue(sql, others, { kind: "assigned", actor: actor.id, cardId: card.id });
}

// A step of a checklist given to someone: a subtask.
export async function stepAssigned(actor: Member, person: string, step: { id: string; text: string }, card: { id: string; title: string; boardId: string }, sql?: Sql): Promise<void> {
  if (person === actor.id) return;
  await notify([person], t => ({ title: format(t.bell.stepAssigned, { name: actor.name, card: cut(card.title, 40) }), body: cut(step.text, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:step:${step.id}` });
  if (sql) await queue(sql, [person], { kind: "step", actor: actor.id, cardId: card.id, stepId: step.id });
}

export async function unassigned(people: string[], cardId: string): Promise<void> {
  if (people.length > 0) await withdraw(`card:${cardId}:assigned`, people);
}

type CardRef = { id: string; title: string; boardId: string };
const mentionKey = (cardId: string, commentId?: string) => (commentId ? `card:${cardId}:mention:${commentId}` : `card:${cardId}:mention`);

export async function mentioned(actor: Member, people: string[], card: CardRef, body: string, sql?: Sql, commentId?: string): Promise<void> {
  if (people.length === 0) return;
  // Each mention is an item of its own (a question asked of someone must
  // not be replaced by the next one).
  await notify(people, t => ({ title: format(t.bell.mentioned, { name: actor.name, card: cut(card.title, 40) }), body: cut(body, 280) }), { path: cardPath(card.boardId, card.id), key: mentionKey(card.id, commentId) });
  if (sql && commentId) {
    await remember(sql, card.id, people, "mention", commentId);
    await queue(sql, people, { kind: "mention", actor: actor.id, cardId: card.id, commentId });
  }
}

export async function commented(actor: Member, people: string[], card: CardRef, body: string, sql?: Sql, commentId?: string): Promise<void> {
  if (people.length === 0) return;
  await notify(people, t => ({ title: format(t.bell.commented, { name: actor.name, card: cut(card.title, 40) }), body: cut(body, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:comment` });
  if (sql && commentId) await remember(sql, card.id, people, "comment", commentId);
}

// Whom this comment was shown to in the bell: a mention's own item, or
// (reason "comment") the card's one item, which now shows this comment.
async function remember(sql: Sql, cardId: string, members: string[], reason: "comment" | "mention", commentId: string): Promise<void> {
  const ids = members.filter(m => m.startsWith("mbr_"));
  if (ids.length === 0) return;
  await sql.begin(async tx => {
    if (reason === "comment") await tx`delete from comment_notices where card_id = ${cardId} and reason = 'comment' and member_id in ${tx(ids)}`;
    await tx`insert into comment_notices ${tx(ids.map(member_id => ({ card_id: cardId, member_id, reason, comment_id: commentId })), "card_id", "member_id", "reason", "comment_id")} on conflict do nothing`;
  });
}

async function noticesOf(sql: Sql, commentId: string): Promise<{ mention: string[]; comment: string[] }> {
  const rows = await sql<{ member_id: string; reason: "comment" | "mention" }[]>`select member_id, reason from comment_notices where comment_id = ${commentId}`;
  return { mention: rows.filter(r => r.reason === "mention").map(r => r.member_id), comment: rows.filter(r => r.reason === "comment").map(r => r.member_id) };
}

// A comment deleted: the items in the bell that show it go at once (its
// words must not stay in colleagues' inboxes); its email, still waiting,
// is held while the Undo lasts and never leaves after (lib/mail.ts).
export async function commentGone(sql: Sql, ref: CommentRef): Promise<void> {
  const told = await noticesOf(sql, ref.id);
  if (told.mention.length > 0) await withdraw(mentionKey(ref.card.id, ref.id), told.mention);
  if (told.comment.length > 0) await withdraw(`card:${ref.card.id}:comment`, told.comment);
}

// A comment brought back (Undo) or edited: the same people are told again,
// with its words as they are now.
export async function commentShown(sql: Sql, ref: CommentRef): Promise<void> {
  const told = await noticesOf(sql, ref.id);
  if (told.mention.length === 0 && told.comment.length === 0) return;
  const author = (await people([ref.author])).get(ref.author);
  const name = author?.status === "member" ? author.name : "";
  const path = cardPath(ref.card.boardId, ref.card.id);
  if (told.mention.length > 0) await notify(told.mention, t => ({ title: format(t.bell.mentioned, { name: name || t.people.unknown, card: cut(ref.card.title, 40) }), body: cut(ref.body, 280) }), { path, key: mentionKey(ref.card.id, ref.id) });
  if (told.comment.length > 0) await notify(told.comment, t => ({ title: format(t.bell.commented, { name: name || t.people.unknown, card: cut(ref.card.title, 40) }), body: cut(ref.body, 280) }), { path, key: `card:${ref.card.id}:comment` });
}

// A card done frees the cards that waited only for it: their people are
// told they can start. Reopened, it takes those items back.
export async function unblocked(blocker: { title: string }, freedCards: { id: string; title: string; boardId: string; assignees: string[] }[]): Promise<void> {
  for (const c of freedCards) {
    if (c.assignees.length === 0) continue;
    await notify(c.assignees, t => ({ title: format(t.bell.unblocked, { card: cut(c.title, 50) }), body: format(t.bell.unblockedBody, { blocker: cut(blocker.title, 200) }) }), { path: cardPath(c.boardId, c.id), key: `card:${c.id}:unblocked` });
  }
}

export async function blockedAgain(cardIds: string[]): Promise<void> {
  for (const id of cardIds) await withdraw(`card:${id}:unblocked`);
}

// A step ticked, taken from someone or removed no longer asks anything.
export async function stepSettled(cardId: string, itemId: string): Promise<void> {
  await withdraw(`card:${cardId}:step:${itemId}`);
}

// A card that is done or archived no longer asks anything of anyone: its
// items go, each mention's too.
export async function settled(cardId: string, sql?: Sql): Promise<void> {
  for (const reason of ["assigned", "mention", "comment", "unblocked"]) await withdraw(`card:${cardId}:${reason}`);
  if (!sql) return;
  const mentions = await sql<{ comment_id: string }[]>`select distinct comment_id from comment_notices where card_id = ${cardId} and reason = 'mention'`;
  for (const m of mentions) await withdraw(mentionKey(cardId, String(m.comment_id)));
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
