import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { listName, stepText } from "../lib/examples.ts";
import { template as loadTemplate } from "../lib/journeys.ts";
import { everyone, nameOf, people } from "../lib/people.ts";
import { BackLink } from "./parts.tsx";

// A template: its name, and its steps — what, who, when — in the order of
// their days. Each change is saved as it is made.
export async function templatePage({ member, locale, t, param }: PageContext): Promise<View> {
  if (!can(member, "checklists.manage")) return notFound();
  const template = await loadTemplate(db(), member, param("id"));
  const listed = (await everyone()).people.map(p => ({ id: p.id, name: p.name }));
  // A named member who is no longer here still shows, read as such.
  const named = template.items.flatMap(i => (i.memberId && !listed.some(p => p.id === i.memberId) ? [i.memberId] : []));
  const gone = await people(named);
  const choices = [...listed, ...named.map(n => ({ id: n, name: nameOf(gone.get(n), locale) }))];
  const name = listName(template, t);
  return {
    title: name,
    body: (
      <div className="page narrow">
        <BackLink href="/chest/checklists">{t.template.back}</BackLink>
        <Island
          id={`template-${template.id}`}
          name="TemplateEditor"
          props={{
            template: { ...template, name, items: template.items.map(i => ({ ...i, text: stepText(i, t) })) },
            people: choices,
            locale,
            t: { template: t.template, kinds: t.checklists.kinds },
          }}
        />
      </div>
    ),
  };
}
