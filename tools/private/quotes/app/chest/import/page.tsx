import { can } from "../../../lib/access.ts";
import { isImportKind } from "../../../lib/parse-import.ts";
import { viewer } from "../../../lib/session.ts";
import { Importer } from "./importer.tsx";

// Bringing the clients or the catalogue from the previous tool: a
// spreadsheet with its columns matched, a look at the first rows, import.
export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const kind = isImportKind(params["kind"]) ? params["kind"] : "clients";
  const allowed = { clients: can(member, "clients.write"), items: can(member, "catalogue.write") };
  return (
    <main className="page narrow">
      <a className="back" href={kind === "clients" ? "/chest/clients" : "/chest/catalogue"}>{kind === "clients" ? t.shell.clients : t.shell.catalogue}</a>
      <div className="page-head">
        <div>
          <h1>{t.importer.title}</h1>
          <p>{t.importer.intro}</p>
        </div>
      </div>
      {allowed[kind] ? <Importer t={t} locale={locale} initialKind={kind} allowed={allowed} /> : <p className="notice">{t.errors.forbidden}</p>}
    </main>
  );
}
