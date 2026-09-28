import type { Member } from "@argentic/chest-sdk/member";
import { urgentCounts } from "./cards.ts";
import type { Sql } from "./db.ts";
import { format } from "./i18n/index.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";

// What Tasks tells people through the Chest's bell, each in their own
// language, and the number on its tile. A notification is keyed by the card
// and its reason, so a new one replaces the old one instead of piling up.
const cardPath = (boardId: string, cardId: string) => `/chest/boards/${boardId}?card=${cardId}`;

export async function assigned(actor: Member, people: string[], card: { id: string; title: string; boardId: string }): Promise<void> {
  const others = people.filter(p => p !== actor.id);
  if (others.length === 0) return;
  await notify(others, t => ({ title: format(t.bell.assigned, { name: actor.name }), body: cut(card.title, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:assigned` });
}

export async function unassigned(people: string[], cardId: string): Promise<void> {
  if (people.length > 0) await withdraw(`card:${cardId}:assigned`, people);
}

export async function mentioned(actor: Member, people: string[], card: { id: string; title: string; boardId: string }, body: string): Promise<void> {
  if (people.length === 0) return;
  await notify(people, t => ({ title: format(t.bell.mentioned, { name: actor.name, card: cut(card.title, 40) }), body: cut(body, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:mention` });
}

export async function commented(actor: Member, people: string[], card: { id: string; title: string; boardId: string }, body: string): Promise<void> {
  if (people.length === 0) return;
  await notify(people, t => ({ title: format(t.bell.commented, { name: actor.name, card: cut(card.title, 40) }), body: cut(body, 280) }), { path: cardPath(card.boardId, card.id), key: `card:${card.id}:comment` });
}

// A card that is done or archived no longer asks anything of anyone.
export async function settled(cardId: string): Promise<void> {
  for (const reason of ["assigned", "mention", "comment"]) await withdraw(`card:${cardId}:${reason}`);
}

// refreshBadges sets the tile's number of these members: their late or
// due-today tasks.
export async function refreshBadges(sql: Sql, people: string[]): Promise<void> {
  const unique = [...new Set(people)].filter(p => p.startsWith("mbr_"));
  if (unique.length === 0) return;
  await badges(await urgentCounts(sql, unique));
}
