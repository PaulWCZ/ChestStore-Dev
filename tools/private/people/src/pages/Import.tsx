import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { Download } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { listFields } from "../lib/fields.ts";
import { BackLink } from "./parts.tsx";

// Import from a spreadsheet (HR): choose the file, see what will change,
// import. And the way out: the directory as a CSV.
export async function importPage({ member, locale, t }: PageContext): Promise<View> {
  if (!can(member, "directory.import")) return notFound();
  const extras = (await listFields(db(), member)).map(f => ({ id: f.id, label: f.label, kind: f.kind }));
  return {
    title: t.import.title,
    body: (
      <div className="page narrow">
        <BackLink href="/chest">{t.profile.back}</BackLink>
        <PageHeader title={t.import.title} intro={<>{t.import.body}<span className="intro-more">{t.import.formats}</span></>} />
        <Island name="Importer" props={{ locale, extras, t: { import: t.import, files: t.files, tables: t.tables } }} />
        {can(member, "directory.export") && <p className="export-link"><a className="link-button" href="/chest/export" download><Download />{t.import.export}</a></p>}
      </div>
    ),
  };
}
