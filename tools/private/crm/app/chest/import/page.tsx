import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { Importer } from "./importer.tsx";

// Bring the clients from another tool: a spreadsheet (HubSpot, Pipedrive,
// Excel) with its columns matched, or an address book (vCard).
export default async function ImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <h1>{t.importer.title}</h1>
          <p className="lede">{t.importer.intro}</p>
        </div>
      </div>
      {can(member, "import") ? <Importer locale={locale} t={t} /> : <p className="notice">{t.importer.readOnly}</p>}
    </main>
  );
}
