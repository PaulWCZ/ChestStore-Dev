import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { allComponents } from "./components.ts";
import type { Query } from "./db.ts";
import { locales } from "./i18n/index.ts";
import { toldIncident, touched, type Incident } from "./incidents.ts";
import { publicOrigin } from "./settings.ts";
import { impactOf } from "./status-view.ts";

// What Status tells the other tools of the Chest (Proposal (studio): events
// between tools, chest.proposals.json "emits"): an incident customers can
// see was opened, updated, resolved or removed — "status.incident",
// version 1. Support shows "Incident in progress" above its inbox and
// offers a saved reply that links the public page, until it is resolved.
// A receiver declares it, and an administrator links the two in the Chest.
//
//   { v: 1, action: "opened" | "updated" | "resolved" | "removed",
//     incident: { id, title, language, titles: {en?, fr?}, status, impact,
//                 started_at, resolved_at, url,
//                 services: [{ id, names: {en?, fr?}, state }] },
//     update: { id, status, at } }
//
// Only incidents the public page shows (never one only about services for
// the team, never a maintenance, never a backfill: it is already over);
// names and titles in each language they were written in; no member, no
// text of the updates (the public page has them). `update.at` orders the
// events (they may arrive out of order); the key makes a repeat one event.
// A courtesy: the incident is saved whatever the Chest answers.

export type IncidentAction = "opened" | "updated" | "resolved" | "removed";

export async function incidentData(sql: Query, i: Incident, action: IncidentAction): Promise<Record<string, unknown>> {
  const titles: Record<string, string> = { [i.language]: i.title };
  if (i.titleSecond && i.secondLanguage) titles[i.secondLanguage] = i.titleSecond;
  const services = new Map((await allComponents(sql)).map(c => [c.id, c]));
  const last = i.updates.find(u => u.removedAt === null && u.status !== "postmortem");
  const origin = await publicOrigin(sql);
  const impact = i.status === "resolved" ? "operational" : impactOf(i);
  return {
    v: 1,
    action,
    incident: {
      id: i.id,
      title: i.title,
      language: i.language,
      titles,
      status: i.status,
      impact,
      started_at: i.startedAt.toISOString(),
      resolved_at: i.resolvedAt?.toISOString() ?? null,
      url: origin ? `${origin}/incidents/${i.id}` : null,
      services: touched(i).flatMap(id => {
        const c = services.get(id);
        if (!c || c.teamOnly) return [];
        const names: Record<string, string> = { [c.language]: c.name };
        const other = locales.find(l => l !== c.language);
        if (c.nameSecond && other) names[other] = c.nameSecond;
        return [{ id: c.id, names, state: i.status === "resolved" ? "operational" : last?.states[id] ?? "operational" }];
      }),
    },
    update: { id: last?.id ?? null, status: last?.status ?? i.status, at: (last?.postedAt ?? i.startedAt).toISOString() },
  };
}

// tellTools publishes what became of an incident. Without the action
// given, it is read from the incident: removed, resolved, else updated.
export async function tellTools(sql: Query, incidentId: string, given?: IncidentAction): Promise<void> {
  const i = await toldIncident(sql, incidentId);
  if (!i || i.backfilled) return;
  const action: IncidentAction = i.removedAt ? "removed" : i.status === "resolved" ? "resolved" : given ?? "updated";
  const data = await incidentData(sql, i, action);
  // The same news twice is one event; a renamed title is new news.
  const digest = createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 12);
  try {
    await events.publish("status.incident", data, { key: `incident:${i.id}:${action}:${digest}` });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    console.warn(`status.incident not published: ${error.code}`);
  }
}
