import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { format, plural } from "./i18n/index.ts";
import { openCounts, openIn } from "./journeys.ts";
import type { Kind } from "./model.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { people } from "./people.ts";

// What People tells people through the Chest's bell, each in their own
// language, and the number on its tile (their open to-dos). One item per
// person and checklist, keyed, replaced as it changes and withdrawn when
// they have nothing left in it.
const todoKey = (journeyId: string) => `journey:${journeyId}:todo`;

// todo sets (or withdraws) each person's item for this checklist: "Welcome
// Nora Petit: 2 to-dos for you", and their tile's number.
export async function todo(sql: Query, actor: Member | null, journey: { id: string; personId: string; kind: Kind }, assignees: Iterable<string>): Promise<void> {
  const who = [...new Set(assignees)].filter(a => a.startsWith("mbr_"));
  if (who.length === 0) return;
  const person = (await people([journey.personId])).get(journey.personId);
  const name = person?.status === "member" || person?.status === "former" ? person.name : "";
  for (const assignee of who) {
    const open = await openIn(sql, journey.id, assignee);
    if (open.length === 0) {
      await withdraw(todoKey(journey.id), [assignee]);
      continue;
    }
    if (actor && assignee === actor.id) continue;
    await notify([assignee], (t, locale) => {
      const words = assignee === journey.personId ? t.bell.yours[journey.kind] : t.bell.todo[journey.kind];
      return { title: plural(words, open.length, locale, { name }), body: cut(open.join(" · "), 280) };
    }, { path: "/chest/todo", key: todoKey(journey.id) });
  }
  await refreshBadges(sql, who);
}

// A checklist stopped or deleted asks nothing of anyone any more.
export async function settled(sql: Query, journeyId: string, assignees: string[]): Promise<void> {
  await withdraw(todoKey(journeyId));
  await refreshBadges(sql, assignees);
}

// The person who started a checklist hears when it is complete.
export async function completed(journey: { id: string; personId: string; kind: Kind; createdBy: string }, actor: Member | null): Promise<void> {
  if (!journey.createdBy.startsWith("mbr_") || journey.createdBy === actor?.id) return;
  const person = (await people([journey.personId])).get(journey.personId);
  const name = person?.name ?? "";
  await notify([journey.createdBy], t => ({ title: format(t.bell.completed[journey.kind], { name }) }), { path: `/chest/checklists/${journey.id}`, key: `journey:${journey.id}:done` });
}

export async function reopened(journeyId: string): Promise<void> {
  await withdraw(`journey:${journeyId}:done`);
}

// HR hears that someone left and who no longer has a manager.
export async function left(hr: string[], leaver: { id: string; name: string }, reports: string[], open: number): Promise<void> {
  if (hr.length === 0) return;
  const names = [...(await people(reports)).values()].map(p => p.name).filter(Boolean);
  await notify(hr, (t, locale) => ({
    title: cut(format(t.bell.left.title, { name: leaver.name || t.people.erased }), 80),
    body: [reports.length ? plural(t.bell.left.reports, reports.length, locale, { names: names.join(", ") }) : "", open ? plural(t.bell.left.items, open, locale) : ""].filter(Boolean).join("\n") || t.bell.left.nothing,
  }), { path: "/chest/chart", key: `left:${leaver.id}` });
}

// refreshBadges sets the tile's number of these members: their open to-dos.
export async function refreshBadges(sql: Query, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].filter(p => p.startsWith("mbr_"));
  if (unique.length === 0) return;
  await badges(await openCounts(sql, unique));
}
