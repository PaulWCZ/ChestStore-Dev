import type { Member } from "@argentic/chest-sdk/member";
import type { Query } from "./db.ts";
import { format, formatDay, money, plural } from "./i18n/index.ts";
import { badges, cut, notify, withdraw } from "./notify.ts";
import { urgentCounts } from "./steps.ts";

// What Clients tells people through the Chest's bell, each in their own
// language, and the number on its tile (late and today's next steps). A
// notification is keyed by what it is about, so a new one replaces the old
// one instead of piling up, and it is withdrawn once settled.

export async function dealGiven(actor: Member, to: string | null, deal: { id: string; title: string; value: number }): Promise<void> {
  if (!to || to === actor.id) return;
  await notify([to], (t, locale) => ({ title: format(t.bell.dealGiven, { name: actor.name }), body: cut(`${deal.title} · ${money(deal.value, locale)}`, 280) }), { path: `/chest/deals/${deal.id}`, key: `deal:${deal.id}:owner` });
}

export async function stepGiven(actor: Member, to: string | null, step: { id: string; text: string; due: string; time: string | null }, on: { kind: "deal" | "contact"; id: string; title: string } | null): Promise<void> {
  if (!to || to === actor.id) return;
  await notify([to], (t, locale) => {
    const day = formatDay(step.due, locale, { weekday: "short", day: "numeric", month: "short" }) + (step.time ? " " + step.time : "");
    return { title: format(t.bell.stepGiven, { name: actor.name }), body: cut(on ? format(t.bell.stepBody, { text: step.text, day, on: on.title }) : format(t.bell.stepBodySelf, { text: step.text, day }), 280) };
  }, { path: on ? `/chest/${on.kind === "deal" ? "deals" : "contacts"}/${on.id}` : "/chest", key: `step:${step.id}` });
}

// A step done, cleared or given to someone else no longer asks anything
// of its former owner.
export async function stepSettled(stepId: string, people?: string[]): Promise<void> {
  await withdraw(`step:${stepId}`, people);
}

export async function dealSettled(dealId: string): Promise<void> {
  await withdraw(`deal:${dealId}:owner`);
}

// Someone left: the managers are told what now has no owner.
export async function left(managers: string[], who: { id: string; name: string }, counts: { deals: number; steps: number; records: number }): Promise<void> {
  if (managers.length === 0 || counts.deals + counts.steps + counts.records === 0) return;
  await notify(managers, (t, locale) => ({
    title: format(t.bell.left, { name: who.name || t.people.erased }),
    body: [plural(t.bell.leftDeals, counts.deals, locale), plural(t.bell.leftSteps, counts.steps, locale), plural(t.bell.leftRecords, counts.records, locale)].join(" · "),
  }), { path: "/chest/deals?view=list&owner=none", key: `left:${who.id}` });
}

// refreshBadges sets the tile's number of these members.
export async function refreshBadges(sql: Query, people: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(people.filter((p): p is string => typeof p === "string" && p.startsWith("mbr_")))];
  if (unique.length === 0) return;
  await badges(await urgentCounts(sql, unique));
}
