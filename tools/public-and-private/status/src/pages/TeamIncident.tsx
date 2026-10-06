import { chest } from "@argentic/chest-sdk/chest";
import { Island, notFound, type MemberContext, type View } from "@argentic/chest-app";
import { format, localeOf, stamp, zoneName } from "../i18n/index.ts";
import { AppError } from "../lib/app-error.ts";
import { allComponents } from "../lib/components.ts";
import { db } from "../lib/db.ts";
import { incidentFor, postmortemOf, touched, type Incident } from "../lib/incidents.ts";
import { otherLanguage } from "../lib/languages.ts";
import type { Impact } from "../lib/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { pickerGroups } from "../lib/picker.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { maintenancePhase } from "../lib/timeline.ts";
import { wall } from "../lib/zone.ts";
import type { UpdateView } from "../components/timeline-view.tsx";

// One incident or maintenance, for editors: its timeline with who posted
// what (and what was corrected or removed), and the next thing to post.
export async function teamIncident({ member, locale: language, t, request }: MemberContext, id: string): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  let incident: Incident;
  try {
    incident = await incidentFor(sql, member, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") return notFound();
    throw error;
  }
  const zone = chest.timeZone;
  const now = new Date();
  const when = (d: Date) => stamp(d, zone, locale, now);
  const ids = [incident.createdBy, incident.removedBy ?? "", ...incident.updates.flatMap(u => [u.author, u.removedBy ?? "", ...u.log.map(l => l.actor)])];
  const who = await people(ids);
  const nameFor = (id: string | null) => (id === "auto" ? t.people.auto : id === member.id ? t.people.you : nameOf(who.get(id ?? ""), locale));
  const components = await allComponents(sql, { locale });
  const names = new Map(components.map(c => [c.id, c.name]));
  const second = incident.secondLanguage ?? otherLanguage(incident.language);
  const secondName = (t.languages as Record<string, string>)[second] ?? second;
  const updates: UpdateView[] = incident.updates.map(u => ({
    id: u.id,
    status: u.status,
    body: u.body,
    bodySecond: u.bodySecond,
    time: when(u.postedAt),
    author: nameFor(u.author),
    auto: u.author === "auto",
    removed: u.removedAt ? format(t.incident.removedBy, { name: nameFor(u.removedBy), time: when(u.removedAt) }) : null,
    states: Object.entries(u.states).map(([c, s]) => ({ name: names.get(c) ?? "", state: s })),
    log: u.log.map(l => {
      const text = format(l.action === "edited" ? t.incident.editedBy : l.action === "removed" ? t.incident.removedBy : t.incident.restoredBy, { name: nameFor(l.actor), time: when(l.at) });
      return { text: l.second ? format(t.incident.secondLog, { text, language: secondName }) : text, previous: l.action === "edited" ? l.previousBody : null };
    }),
  }));
  const publicLink = `${publicOrigin(request.headers) ?? ""}/incidents/${incident.id}?fresh=${Math.floor(now.getTime() / 1000)}`;
  const removed = incident.removedAt ? format(t.incident.removedBanner, { name: nameFor(incident.removedBy), time: when(incident.removedAt) }) : null;
  const words = { incident: t.incident, compose: t.compose, steps: t.steps, stepHelp: t.stepHelp, states: t.states, errors: t.errors, maintenance: t.maintenance, people: t.people, dialog: t.dialog, date: t.date };
  const languages = { second, secondName };
  const groups = pickerGroups(components);
  const affected = touched(incident).map(c => names.get(c) ?? "").filter(Boolean);

  if (incident.kind === "maintenance") {
    const phase = maintenancePhase({ status: incident.status, startedAt: incident.startedAt.getTime(), endsAt: incident.endsAt?.getTime() ?? null, resolvedAt: incident.resolvedAt?.getTime() ?? null }, now.getTime());
    const start = wall(incident.startedAt, zone), end = wall(incident.endsAt ?? incident.startedAt, zone);
    return { title: incident.title, body: (
      <Island name="MaintenanceView" props={{
        incident: { id: incident.id, title: incident.title, titleSecond: incident.titleSecond, phase, window: format(t.time.range, { from: when(incident.startedAt), to: incident.endsAt ? when(incident.endsAt) : "" }), affected, autoPosts: incident.autoPosts, removed, hasSecond: incident.secondLanguage !== null },
        languages,
        form: { start: { day: start.date, minutes: start.minutes }, end: { day: end.date, minutes: end.minutes }, components: incident.components, groups, zoneNote: format(t.maintenance.zone, { zone: zoneName(zone) }), today: chest.today() },
        updates,
        publicLink,
        t: words,
      }} />
    ) };
  }

  const latest = incident.updates.find(u => u.removedAt === null && u.status !== "resolved" && u.status !== "postmortem");
  const pm = postmortemOf(incident);
  return { title: incident.title, body: (
    <Island name="IncidentView" props={{
      incident: { id: incident.id, title: incident.title, titleSecond: incident.titleSecond, status: incident.status, backfilled: incident.backfilled, removed, affected, hasSecond: incident.secondLanguage !== null, postmortem: pm ? { body: pm.body, bodySecond: pm.bodySecond } : null },
      languages,
      current: (latest?.states ?? {}) as Record<string, Impact>,
      groups,
      updates,
      publicLink,
      t: words,
    }} />
  ) };
}
