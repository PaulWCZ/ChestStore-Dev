import { stepText } from "../../../../../lib/examples.ts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../components/icons.tsx";
import { can } from "../../../../../lib/access.ts";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { template as loadTemplate, type Template } from "../../../../../lib/journeys.ts";
import { id as rowId } from "../../../../../lib/model.ts";
import { everyone, nameOf, people } from "../../../../../lib/people.ts";
import { viewer } from "../../../../../lib/session.ts";
import { TemplateEditor } from "./template-editor.tsx";

// A template: its name, and its steps — what, who, when — in the order of
// their days. Each change is saved as it is made.
export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "checklists.manage")) notFound();
  const { id } = await params;
  let template: Template;
  try {
    template = await loadTemplate(db(), member, rowId(id));
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const listed = (await everyone()).people.map(p => ({ id: p.id, name: p.name }));
  // A named member who is no longer here still shows, read as such.
  const named = template.items.flatMap(i => (i.memberId && !listed.some(p => p.id === i.memberId) ? [i.memberId] : []));
  const gone = await people(named);
  const choices = [...listed, ...named.map(n => ({ id: n, name: nameOf(gone.get(n), locale) }))];
  return (
    <main className="page narrow">
      <Link className="back" href="/chest/checklists"><Back />{t.template.back}</Link>
      <TemplateEditor template={{ ...template, items: template.items.map(i => ({ ...i, text: stepText(i, t) })) }} people={choices} locale={locale} t={{ template: t.template, kinds: t.checklists.kinds, errors: t.errors }} />
    </main>
  );
}
