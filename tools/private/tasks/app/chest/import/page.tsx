import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { Importer } from "./importer.tsx";

// Bring a board from Trello, Asana or a spreadsheet.
export default async function ImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  return (
    <main className="narrow">
      <h1>{t.importer.title}</h1>
      <p className="muted" style={{ margin: "var(--space-2) 0 var(--space-5)" }}>{t.importer.intro}</p>
      {can(member, "import") ? <Importer locale={locale} t={{ importer: t.importer, errors: t.errors }} /> : <p className="notice" style={{ margin: 0 }}>{t.errors.forbidden}</p>}
    </main>
  );
}
