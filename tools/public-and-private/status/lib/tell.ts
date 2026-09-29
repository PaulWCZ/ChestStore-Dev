import { ChestError } from "@argentic/chest-sdk/errors";
import type { Locale } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import * as notifications from "@argentic/chest-sdk/notifications";
import { roles } from "./access.ts";
import type { Query } from "./db.ts";
import { catalogue, format, locales, type Catalogue } from "./i18n/index.ts";
import { openCount } from "./incidents.ts";
import { badges, cut } from "./notify.ts";
import { checkError } from "./check-words.ts";

// What the team is told through the Chest: a new incident rings the bell
// of everyone who runs the page (each in their language), its resolution
// replaces that item; the tile shows how many incidents are open.

export const incidentPath = (incidentId: string) => `/chest/incidents/${incidentId}`;
const key = (incidentId: string) => `incident:${incidentId}`;

type Message = { title: string; body?: string };
type Words = (t: Catalogue, locale: Locale) => Message;

// The team: everyone who has the tool with a role, page by page (500 at a
// time, 20 pages at most).
async function team(): Promise<{ id: string; locale: Locale }[]> {
  const found: { id: string; locale: Locale }[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const answer: members.MemberPage = await members.list({ limit: 500, ...(after ? { after } : {}) });
    found.push(...answer.members.filter(m => m.role !== null && (roles as readonly string[]).includes(m.role)).map(m => ({ id: m.id, locale: m.locale })));
    if (!answer.next) break;
    after = answer.next;
  }
  return found;
}

// tellTeam uses notifications.broadcast (Proposal (studio)): one call, the
// Chest picks each member's language. On a Chest without it, the tool lists
// its team and notifies each language's group. A notification is a
// courtesy: the incident is posted whatever happens here.
async function tellTeam(words: Words, path: string, itemKey: string): Promise<"broadcast" | "notify" | "none"> {
  const messages = Object.fromEntries(locales.map(l => {
    const m = words(catalogue(l), l);
    return [l, { title: cut(m.title, 80), ...(m.body ? { body: cut(m.body, 280) } : {}) }];
  })) as { en: Message } & Partial<Record<Locale, Message>>;
  try {
    await notifications.broadcast({ messages, path, key: itemKey, to: { roles: [...roles] } });
    return "broadcast";
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  try {
    const people = await team();
    const byLocale = new Map<Locale, string[]>();
    for (const p of people) byLocale.set(p.locale, [...(byLocale.get(p.locale) ?? []), p.id]);
    for (const [locale, ids] of byLocale) {
      const m = messages[locale] ?? messages.en;
      for (let i = 0; i < ids.length; i += 500) await notifications.notify(ids.slice(i, i + 500), { ...m, path, key: itemKey });
    }
    return byLocale.size ? "notify" : "none";
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return "none";
  }
}

export async function incidentOpened(incident: { id: string; title: string }, state: string, list: string[]): Promise<void> {
  await tellTeam(
    t => ({ title: format(t.bell.incident, { title: incident.title }), body: format(t.bell.incidentBody, { state: t.states[state as keyof Catalogue["states"]] ?? state, list: list.join(", ") }) }),
    incidentPath(incident.id),
    key(incident.id),
  );
}

export async function incidentResolved(incident: { id: string; title: string }): Promise<void> {
  await tellTeam(t => ({ title: format(t.bell.resolved, { title: incident.title }) }), incidentPath(incident.id), key(incident.id));
}

// An incident removed from the page: its bell items go.
export async function incidentRemoved(incidentId: string): Promise<void> {
  try {
    await notifications.withdraw(key(incidentId));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

// The tile's number, for everyone who runs the page: the open incidents.
export async function refreshBadges(sql: Query): Promise<void> {
  const count = await openCount(sql);
  try {
    const people = await team();
    await badges(new Map(people.map(p => [p.id, count])));
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
}

export async function refreshBadge(sql: Query, memberId: string): Promise<void> {
  await badges(new Map([[memberId, await openCount(sql)]]));
}

// A watched component stopped answering (three checks in a row), or came
// back: the editors hear it once each way, the second replacing the first.
// Nothing is posted on the public page: a person decides.
export async function checkChanged(change: { componentId: string; kind: "down" | "up"; error: string | null; status: number | null; ms: number }, component: string): Promise<void> {
  const path = change.kind === "down" ? `/chest#check-${change.componentId}` : "/chest";
  await tellTeam(
    t => (change.kind === "down"
      ? { title: format(t.checks.alertTitle, { component }), body: format(t.checks.alertBody, { error: checkError(t.checks, change.error, change.status, change.ms) }) }
      : { title: format(t.checks.upTitle, { component }) }),
    path,
    `check:${change.componentId}`,
  );
}

// A heartbeat fell silent, or its job called again: told like a check.
export async function heartbeatChanged(change: { componentId: string; kind: "down" | "up"; since: Date }, component: string): Promise<void> {
  await tellTeam(
    t => (change.kind === "down" ? { title: format(t.heartbeats.alertTitle, { component }), body: t.heartbeats.alertBody } : { title: format(t.heartbeats.upTitle, { component }) }),
    change.kind === "down" ? `/chest#heartbeat-${change.componentId}` : "/chest",
    `heartbeat:${change.componentId}`,
  );
}
