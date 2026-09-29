import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Back } from "../../../components/icons.tsx";
import { IncidentCard, Postmortem, titleIn } from "../../../components/incident-card.tsx";
import { PublicShell } from "../../../components/public-shell.tsx";
import { format } from "../../../lib/i18n/index.ts";
import { publicIncident } from "../../../lib/incidents.ts";
import { publicContext } from "../../../lib/public-page.ts";
import { impactOf, statusView, touchedNames } from "../../../lib/status-view.ts";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { t, locale, company, sql } = await publicContext();
  const incident = await publicIncident(sql, (await params).id);
  const site = company ? format(t.meta.publicTitle, { company }) : t.meta.publicPlain;
  return { title: incident ? `${titleIn(incident, locale).text} — ${site}` : site, robots: { index: true, follow: true } };
}

// One incident's own page: the address to send customers ("see
// status.example.com/incidents/12"), with its whole timeline.
export default async function IncidentPage({ params }: Props) {
  const { id } = await params;
  const { t, locale, sql, now, zone, company, offerMail } = await publicContext();
  const incident = await publicIncident(sql, id);
  if (!incident || (incident.kind === "maintenance" && incident.updates.length === 0)) notFound();
  const view = await statusView(sql, zone, now);
  const words = { public: t.public, steps: t.steps, states: t.states, time: t.time, maintenance: t.maintenance };
  return (
    <PublicShell company={company} locale={locale} zone={zone} t={t} path={`/incidents/${incident.id}`} offerMail={offerMail}>
      <p className="crumb"><a href="/"><Back />{t.public.back}</a></p>
      <IncidentCard incident={incident} impact={impactOf(incident, now)} affected={touchedNames(incident, view.names)} zone={zone} locale={locale} t={words} now={now} heading="h1" link={false} />
      <Postmortem incident={incident} zone={zone} locale={locale} t={words} now={now} />
    </PublicShell>
  );
}
