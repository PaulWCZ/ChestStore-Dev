import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { directory } from "../../../../lib/directory.ts";
import { listArrivals } from "../../../../lib/arrivals.ts";
import { listTemplates } from "../../../../lib/journeys.ts";
import { isKind, memberPattern } from "../../../../lib/model.ts";
import { today } from "../../../../lib/zone.ts";
import { viewer } from "../../../../lib/session.ts";
import { StartForm } from "./start-form.tsx";
import { formatDay } from "../../../../lib/i18n/index.ts";

// Starting a checklist: for whom, from which template, from which day. The
// person's start date is offered for an arrival.
export default async function NewChecklistPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const weekdays = Array.from({ length: 7 }, (_, i) => formatDay(`2024-01-${String(7 + i).padStart(2, "0")}`, locale, { weekday: "long" }));
  if (!can(member, "checklists.manage")) notFound();
  const sql = db();
  const [{ entries }, templates, told] = await Promise.all([directory(sql, member), listTemplates(sql, member), listArrivals(sql, member)]);
  const arrivals = told.filter(a => a.status === "expected");
  const query = await searchParams;
  const asked = typeof query["arrival"] === "string" ? arrivals.find(a => a.id === query["arrival"]) : undefined;
  const person = asked ? "arrival:" + asked.id : typeof query["person"] === "string" && memberPattern.test(query["person"]) ? query["person"] : "";
  const kind = asked ? "onboarding" : isKind(query["kind"]) ? query["kind"] : "onboarding";
  const template = typeof query["template"] === "string" ? query["template"] : "";
  return (
    <main className="page narrow">
      <Link className="back" href="/chest/checklists"><Back />{t.checklists.title}</Link>
      <h1 className="edit-title">{t.start.title}</h1>
      {templates.length === 0 ? (
        <div className="empty">
          <p>{t.start.noTemplates}</p>
          <Link className="button" href="/chest/checklists">{t.start.newTemplate}</Link>
        </div>
      ) : (
        <StartForm
          people={entries.map(e => ({ id: e.id, name: e.name, startDate: e.startDate }))}
          arrivals={arrivals.map(a => ({ id: "arrival:" + a.id, name: a.name, startDate: a.startDate, managerId: a.managerId }))}
          templates={templates.map(x => ({ id: x.id, name: x.name, kind: x.kind, steps: x.items.length }))}
          initial={{ person, kind, template }}
          today={today()}
          weekdays={weekdays}
          t={{ start: t.start, kinds: t.checklists.kinds, group: t.arrivals.group, errors: t.errors }}
        />
      )}
    </main>
  );
}
