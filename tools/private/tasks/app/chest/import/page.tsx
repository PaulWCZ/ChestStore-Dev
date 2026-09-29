import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { Importer } from "./importer.tsx";

// Bring a board from Trello, Asana or a spreadsheet.
export default async function ImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  return (
    <div className="narrow">
      <h1>{t.importer.title}</h1>
      <p className="muted intro">{t.importer.intro}</p>
      {can(member, "import") ? <Importer locale={locale} t={{ importer: t.importer, errors: t.errors }} /> : <p className="notice flat">{t.errors.forbidden}</p>}
    </div>
  );
}
