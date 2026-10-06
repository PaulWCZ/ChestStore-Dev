import { notFound, type View } from "@argentic/chest-app";
import { Back } from "../components/icons.tsx";
import { publicIncident } from "../lib/incidents.ts";
import type { PublicContext } from "../lib/public-page.ts";
import { impactOf, statusView, touchedNames } from "../lib/status-view.ts";
import { IncidentCard, Postmortem, titleIn } from "./parts/incident-card.tsx";
import { indexed, siteTitle } from "./parts/meta.tsx";
import { PublicShell } from "./parts/public-shell.tsx";

// One incident's own page: the address to send customers ("see
// status.example.com/incidents/12"), with its whole timeline. A removed
// incident, one only about services for the team, or a maintenance with
// nothing posted yet: not found.
export async function publicIncidentPage(context: PublicContext, id: string): Promise<View> {
  const { t, locale, sql, now, zone, offerUpdates } = context;
  const incident = await publicIncident(sql, id);
  if (!incident || (incident.kind === "maintenance" && incident.updates.length === 0)) return notFound();
  const view = await statusView(sql, zone, now, { locale });
  const words = { public: t.public, steps: t.steps, states: t.states, time: t.time, maintenance: t.maintenance };
  return { title: siteTitle(context, titleIn(incident, locale).text), exactTitle: true, head: indexed(), body: (
    <PublicShell context={context} path={`/incidents/${incident.id}`} offerMail={offerUpdates}>
      <p className="crumb"><a href="/"><Back />{t.public.back}</a></p>
      <IncidentCard incident={incident} impact={impactOf(incident, now)} affected={touchedNames(incident, view.names)} zone={zone} locale={locale} t={words} now={now} heading="h1" link={false} />
      <Postmortem incident={incident} zone={zone} locale={locale} t={words} now={now} />
    </PublicShell>
  ) };
}
