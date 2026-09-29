import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { format, formatDay, plural } from "./i18n/index.ts";
import { stepText } from "./examples.ts";
import { about, openCounts, openIn } from "./journeys.ts";
import type { Kind } from "./model.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { people } from "./people.ts";

// What People tells people through the Chest's bell, each in their own
// language, and the number on its tile (their open to-dos). One item per
// person and checklist, keyed, replaced as it changes and withdrawn when
// they have nothing left in it.
const todoKey = (journeyId: string) => `journey:${journeyId}:todo`;

// Whom a checklist is about, as the bell writes it: a member's name from
// the Chest, or the name of an arrival told by another tool.
async function subject(sql: Query, journeyId: string): Promise<{ personId: string | null; name: string; kind: Kind; createdBy: string }> {
  const a = await about(sql, journeyId);
  if (!a.personId) return { personId: null, name: a.arrivalName ?? "", kind: a.kind, createdBy: a.createdBy };
  const person = (await people([a.personId])).get(a.personId);
  const name = person?.status === "member" || person?.status === "former" ? person.name : "";
  return { personId: a.personId, name, kind: a.kind, createdBy: a.createdBy };
}

// todo sets (or withdraws) each person's item for this checklist: "Welcome
// Nora Petit: 2 to-dos for you", and their tile's number.
export async function todo(sql: Query, actor: Member | null, journey: { id: string }, assignees: Iterable<string>): Promise<void> {
  const who = [...new Set(assignees)].filter(a => a.startsWith("mbr_"));
  if (who.length === 0) return;
  const it = await subject(sql, journey.id);
  for (const assignee of who) {
    const open = await openIn(sql, journey.id, assignee);
    if (open.length === 0) {
      await withdraw(todoKey(journey.id), [assignee]);
      continue;
    }
    if (actor && assignee === actor.id) continue;
    await notify([assignee], (t, locale) => {
      const words = assignee === it.personId ? t.bell.yours[it.kind] : t.bell.todo[it.kind];
      return { title: plural(words, open.length, locale, { name: it.name }), body: cut(open.map(o => stepText(o, t)).join(" · "), 280) };
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
export async function completed(sql: Query, journeyId: string, actor: Member | null): Promise<void> {
  const it = await subject(sql, journeyId);
  if (!it.createdBy.startsWith("mbr_") || it.createdBy === actor?.id) return;
  await notify([it.createdBy], t => ({ title: format(t.bell.completed[it.kind], { name: it.name }) }), { path: `/chest/checklists/${journeyId}`, key: `journey:${journeyId}:done` });
}

export async function reopened(journeyId: string): Promise<void> {
  await withdraw(`journey:${journeyId}:done`);
}

// HR hears that someone left: whose manager they were (they keep their
// place in the org chart, flagged), how many to-dos came to HR, and that
// their record needs a last day.
export async function left(hr: string[], leaver: { id: string; name: string }, change: { reports: string[]; open: number; record: boolean }): Promise<void> {
  if (hr.length === 0) return;
  const names = [...(await people(change.reports)).values()].map(p => p.name).filter(Boolean);
  await notify(hr, (t, locale) => ({
    title: cut(format(t.bell.left.title, { name: leaver.name || t.people.erased }), 80),
    body: [
      change.reports.length ? plural(t.bell.left.reports, change.reports.length, locale, { names: names.join(", ") }) : "",
      change.open ? plural(t.bell.left.items, change.open, locale) : "",
      change.record ? t.bell.left.record : "",
    ].filter(Boolean).join("\n") || t.bell.left.nothing,
  }), { path: change.reports.length ? "/chest/chart" : "/chest/records", key: `left:${leaver.id}` });
}

// HR hears of an arrival told by another tool ("Hiring: Lucie Garnier
// joins on 2 November as Sales associate"), and of a hire cancelled.
export async function arrivalTold(hr: string[], a: { id: string; name: string; job: string; startDate: string | null }): Promise<void> {
  if (hr.length === 0) return;
  await notify(hr, (t, locale) => {
    const date = a.startDate ? formatDay(a.startDate, locale, { day: "numeric", month: "long" }) : "";
    const words = a.startDate ? (a.job ? t.bell.arrival.dated : t.bell.arrival.datedNoJob) : (a.job ? t.bell.arrival.undated : t.bell.arrival.undatedNoJob);
    return { title: cut(format(words, { name: a.name, date, job: a.job }), 80), body: t.bell.arrival.body };
  }, { path: "/chest/checklists#arrivals", key: `arrival:${a.id}` });
}

export async function arrivalCancelled(hr: string[], a: { id: string; name: string; kept: boolean }): Promise<void> {
  if (hr.length === 0) return;
  await notify(hr, t => ({ title: cut(format(t.bell.arrival.cancelled, { name: a.name }), 80), body: a.kept ? t.bell.arrival.cancelledKept : t.bell.arrival.cancelledGone }), { path: "/chest/checklists#arrivals", key: `arrival:${a.id}` });
}

// refreshBadges sets the tile's number of these members: their open to-dos.
export async function refreshBadges(sql: Query, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].filter(p => p.startsWith("mbr_"));
  if (unique.length === 0) return;
  await badges(await openCounts(sql, unique));
}
