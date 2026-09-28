import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { directory } from "../../../../lib/directory.ts";
import { listTemplates } from "../../../../lib/journeys.ts";
import { isKind, memberPattern } from "../../../../lib/model.ts";
import { today } from "../../../../lib/zone.ts";
import { viewer } from "../../../../lib/session.ts";
import { StartForm } from "./start-form.tsx";

// Starting a checklist: for whom, from which template, from which day. The
// person's start date is offered for an arrival.
export default async function NewChecklistPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "checklists.manage")) notFound();
  const sql = db();
  const [{ entries }, templates] = await Promise.all([directory(sql, member), listTemplates(sql, member)]);
  const query = await searchParams;
  const person = typeof query["person"] === "string" && memberPattern.test(query["person"]) ? query["person"] : "";
  const kind = isKind(query["kind"]) ? query["kind"] : "onboarding";
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
          templates={templates.map(x => ({ id: x.id, name: x.name, kind: x.kind, steps: x.items.length }))}
          initial={{ person, kind, template }}
          today={today()}
          t={{ start: t.start, kinds: t.checklists.kinds, errors: t.errors }}
        />
      )}
    </main>
  );
}
