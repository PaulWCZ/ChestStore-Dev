import { createHash } from "node:crypto";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import { log } from "@argentic/chest-app";
import { allComponents } from "./components.ts";
import type { Query } from "./db.ts";
import { locales } from "../i18n/index.ts";
import { toldIncident, touched, type Incident } from "./incidents.ts";
import { publicOrigin } from "./settings.ts";
import { impactOf } from "./status-view.ts";

// What Status tells the other tools of the Chest (an event between tools,
// SDK 0.7.0, chest.json's "emits" with its fields): an incident customers
// can see was opened, updated, resolved or removed — "status.incident".
// Support shows "Incident in progress" above its inbox and offers a saved
// reply that links the public page, until it is resolved. The owner
// approves the link when both tools are installed. Contract 0.7 carries
// flat fields of declared kinds only (no object, no list), so the texts per
// language travel as JSON in a text field:
//
//   incident: id, action: text (opened | updated | resolved | removed),
//   status: text, impact: text, language: text, title: text,
//   titles: text — JSON {"en"?: "…", "fr"?: "…"},
//   services: text — JSON [{"id", "names": {"en"?, "fr"?}, "state"}],
//   startedAt: time, resolvedAt: time?, url: text?, update: id?, updatedAt: time
//
// Only incidents the public page shows (never one only about services for
// the team, never a maintenance, never a backfill: it is already over);
// names and titles in each language they were written in; no member, no
// text of the updates (the public page has them). Its subject is the
// incident (a receiver gets one incident's events in order) and it is for
// everyone (no audience: the public page shows it to the world);
// `updatedAt` orders the news; the key makes a repeat one event. A
// courtesy: the incident is saved whatever the Chest answers.

export type IncidentAction = "opened" | "updated" | "resolved" | "removed";

export async function incidentData(sql: Query, i: Incident, action: IncidentAction): Promise<Record<string, unknown>> {
  const titles: Record<string, string> = { [i.language]: i.title };
  if (i.titleSecond && i.secondLanguage) titles[i.secondLanguage] = i.titleSecond;
  const services = new Map((await allComponents(sql)).map(c => [c.id, c]));
  const last = i.updates.find(u => u.removedAt === null && u.status !== "postmortem");
  const origin = await publicOrigin(sql);
  const impact = i.status === "resolved" ? "operational" : impactOf(i);
  return {
    incident: i.id,
    action,
    status: i.status,
    impact,
    language: i.language,
    title: i.title,
    titles: JSON.stringify(titles),
    services: JSON.stringify(touched(i).flatMap(id => {
      const c = services.get(id);
      if (!c || c.teamOnly) return [];
      const names: Record<string, string> = { [c.language]: c.name };
      const other = locales.find(l => l !== c.language);
      if (c.nameSecond && other) names[other] = c.nameSecond;
      return [{ id: c.id, names, state: i.status === "resolved" ? "operational" : last?.states[id] ?? "operational" }];
    })),
    startedAt: i.startedAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    url: origin ? `${origin}/incidents/${i.id}` : null,
    update: last?.id ?? null,
    updatedAt: (last?.postedAt ?? i.startedAt).toISOString(),
  };
}

// When it happened, told to the Chest (events.emit's occurredAt): the last
// update's time, when it is within the 72 hours the Chest takes (five
// minutes of margin for the clocks); older, the Chest's own time.
const occurredBehindMs = 72 * 3_600_000 - 5 * 60_000;
export const occurredAtOf = (at: Date, now = Date.now()): Date | undefined => (now - at.getTime() < occurredBehindMs && at.getTime() <= now ? at : undefined);

// tellTools emits what became of an incident. Without the action given,
// it is read from the incident: removed, resolved, else updated.
export async function tellTools(sql: Query, incidentId: string, given?: IncidentAction): Promise<void> {
  const i = await toldIncident(sql, incidentId);
  if (!i || i.backfilled) return;
  const action: IncidentAction = i.removedAt ? "removed" : i.status === "resolved" ? "resolved" : given ?? "updated";
  const data = await incidentData(sql, i, action);
  // The same news twice is one event; a renamed title is new news.
  const digest = createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 12);
  const occurredAt = occurredAtOf(new Date(data["updatedAt"] as string));
  try {
    await events.emit("status.incident", data, { subject: i.id, key: `incident:${i.id}:${action}:${digest}`, ...(occurredAt ? { occurredAt } : {}) });
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    log.warn("status.incident not told", { code: error.code });
  }
}
