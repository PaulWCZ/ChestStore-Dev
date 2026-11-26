import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { localeOf } from "../i18n/index.ts";
import { canImport } from "../lib/importers.ts";
import { isImportKind } from "../shared/parse-import.ts";

// Bringing the clients, the catalogue or the invoices still to collect
// from the previous tool: a spreadsheet with its columns matched, a look at
// the first rows, import.
export function importPage(ctx: PageContext<MemberContext>): View {
  const { member, t } = ctx;
  const asked = ctx.query("kind");
  const kind = isImportKind(asked) ? asked : "clients";
  const allowed = { clients: canImport(member, "clients"), items: canImport(member, "items"), invoices: canImport(member, "invoices") };
  const back = { clients: ["/chest/clients", t.shell.clients], items: ["/chest/catalogue", t.shell.catalogue], invoices: ["/chest/invoices", t.shell.invoices] }[kind];
  return {
    title: t.importer.title,
    body: (
      <div className="page narrow">
        <a className="back" href={back[0]}><Back />{back[1]}</a>
        <PageHeader size="m" title={t.importer.title} intro={t.importer.intro} />
        {allowed[kind] ? <Island name="Importer" props={{ t: { importer: t.importer, errors: t.errors, kit: t.kit }, locale: localeOf(ctx.locale), initialKind: kind, allowed }} /> : <p className="notice">{t.errors.forbidden}</p>}
      </div>
    ),
  };
}
