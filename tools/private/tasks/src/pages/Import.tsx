import { localeOf } from "../i18n/index.ts";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { can } from "../lib/access.ts";

// Bring a board from Trello, Asana or a spreadsheet: the importer reads the
// files in the browser to show what will come (an island).
export function importPage({ member, locale: language, t }: PageContext): View {
  const locale = localeOf(language);
  return {
    title: t.importer.title,
    body: (
      <div className="narrow">
        <h1>{t.importer.title}</h1>
        <p className="muted intro">{t.importer.intro}</p>
        {can(member, "import") ? <Island name="Importer" props={{ locale, doneName: t.templates.columns.done, t: { importer: t.importer, errors: t.errors } }} /> : <p className="notice flat">{t.errors.forbidden}</p>}
      </div>
    ),
  };
}
