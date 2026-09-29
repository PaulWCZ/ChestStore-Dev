import { PageHeader } from "@argentic/chest-ui/components";
import { Back } from "../../../components/icons.tsx";
import { canImport } from "../../../lib/importers.ts";
import { isImportKind } from "../../../lib/parse-import.ts";
import { viewer } from "../../../lib/session.ts";
import { Importer } from "./importer.tsx";

// Bringing the clients, the catalogue or the invoices still to collect
// from the previous tool: a
// spreadsheet with its columns matched, a look at the first rows, import.
export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const kind = isImportKind(params["kind"]) ? params["kind"] : "clients";
  const allowed = { clients: canImport(member, "clients"), items: canImport(member, "items"), invoices: canImport(member, "invoices") };
  const back = { clients: ["/chest/clients", t.shell.clients], items: ["/chest/catalogue", t.shell.catalogue], invoices: ["/chest/invoices", t.shell.invoices] }[kind];
  return (
    <div className="page narrow">
      <a className="back" href={back[0]}><Back />{back[1]}</a>
      <PageHeader size="m" title={t.importer.title} intro={t.importer.intro} />
      {allowed[kind] ? <Importer t={t} locale={locale} initialKind={kind} allowed={allowed} /> : <p className="notice">{t.errors.forbidden}</p>}
    </div>
  );
}
