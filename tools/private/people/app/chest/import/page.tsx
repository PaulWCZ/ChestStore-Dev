import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Download } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { db } from "../../../lib/db.ts";
import { listFields } from "../../../lib/fields.ts";
import { Importer } from "./importer.tsx";

// Import from a spreadsheet (HR): choose the file, see what will change,
// import. And the way out: the directory as a CSV.
export default async function ImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "directory.import")) notFound();
  return (
    <main className="page narrow">
      <Link className="back" href="/chest"><Back />{t.profile.back}</Link>
      <div className="page-head">
        <div>
          <h1>{t.import.title}</h1>
          <p className="muted lead">{t.import.body}</p>
          <p className="muted small">{t.import.formats}</p>
        </div>
      </div>
      <Importer locale={locale} extras={(await listFields(db(), member)).map(f => ({ id: f.id, label: f.label }))} t={{ import: t.import, errors: t.errors }} />
      {can(member, "directory.export") && <p className="export-link"><a className="link-button" href="/chest/export" download><Download />{t.import.export}</a></p>}
    </main>
  );
}
