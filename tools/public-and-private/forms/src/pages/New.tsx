import { Island } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { plural } from "../i18n/index.ts";
import { mayCreate } from "../lib/creators.ts";
import { template, templateKeys } from "../lib/templates.ts";
import type { Choice } from "../islands/Picker.tsx";
import type { Ctx } from "./context.ts";

// Start a form: blank, one of the templates (in the member's language), or
// the questions of a form brought from Google Forms or Typeform.
export async function newPage({ sql, member, t, lang }: Ctx) {
  if (!(await mayCreate(sql, member))) {
    return { title: t.create.title, body: <div className="narrow"><a className="back-link" href="/chest"><Back />{t.create.back}</a><EmptyState headingLevel={1} title={t.home.noCreate} /></div> };
  }
  const choices: Choice[] = templateKeys.map(key => {
    const { definition, settings } = template(key, t);
    const questions = definition.pages.flatMap(p => p.questions);
    return { key, name: t.templates[key].name, blurb: t.templates[key].blurb, kinds: questions.slice(0, 6).map(q => q.kind), count: key === "blank" ? "" : plural(t.create.questions, questions.length, lang), accent: settings.accent ?? "berry" };
  });
  return {
    title: t.create.title,
    body: (
      <div className="narrow">
        <a className="back-link" href="/chest"><Back />{t.create.back}</a>
        <h1 className="page-title">{t.create.title}</h1>
        <p className="lede">{t.create.lede}</p>
        <Island name="Picker" props={{ choices, creating: t.create.creating }} />
        <Island name="ImportForm" props={{ t: { importTitle: t.create.importTitle, importHint: t.create.importHint, importFile: t.create.importFile, importPaste: t.create.importPaste, importGo: t.create.importGo, importing: t.create.importing }, files: t.kit.files }} />
      </div>
    ),
  };
}
