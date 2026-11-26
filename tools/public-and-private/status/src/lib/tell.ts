import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import * as notifications from "@argentic/chest-sdk/notifications";
import { roles } from "./access.ts";
import type { Query } from "./db.ts";
import { format, type Catalogue, type Locale } from "../i18n/index.ts";
import { openCount } from "./incidents.ts";
import { badges, notice } from "./notify.ts";
import { checkError } from "./check-words.ts";

// What the team is told through the Chest: a new incident rings the bell
// of everyone who runs the page (each in their language), its resolution
// replaces that item; the tile shows how many incidents are open.

export const incidentPath = (incidentId: string) => `/chest/incidents/${incidentId}`;
const key = (incidentId: string) => `incident:${incidentId}`;

type Words = (t: Catalogue, locale: Locale) => { title: string; body?: string };

// The team: everyone who has the tool with a role, page by page (500 at a
// time, 20 pages at most) — only for the tile's number, and to notify them
// on a Chest without broadcast.
async function team(): Promise<string[]> {
  const found: string[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const answer: members.MemberPage = await members.list({ limit: 500, ...(after ? { after } : {}) });
    found.push(...answer.members.filter(m => m.role !== null && (roles as readonly string[]).includes(m.role)).map(m => m.id));
    if (!answer.next) break;
    after = answer.next;
  }
  return found;
}

// tellTeam uses notifications.broadcast (Proposal (studio), announced for
// 0.5): one call to everyone with a role, each member reading the notice in
// their language (its translations). On a Chest without it (or past its 30
// broadcasts an hour), the tool lists its team and notifies them, 500 at a
// time, with the same translated notice. A notification is a courtesy: the
// incident is posted whatever happens here.
async function tellTeam(words: Words, path: string, itemKey: string): Promise<"broadcast" | "notify" | "none"> {
  const told = notice(words, { path, key: itemKey });
  try {
    await notifications.broadcast(told, { to: { roles: [...roles] } });
    return "broadcast";
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
  }
  try {
    const ids = await team();
    for (let i = 0; i < ids.length; i += 500) await notifications.notify(ids.slice(i, i + 500), told);
    return ids.length ? "notify" : "none";
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
    await badges(new Map(people.map(id => [id, count])));
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
