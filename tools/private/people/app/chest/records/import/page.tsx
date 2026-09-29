import { PageHeader } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { recordTargets } from "../../../../lib/record-import.ts";
import { viewer } from "../../../../lib/session.ts";
import { RecordImporter } from "./record-importer.tsx";

// HR records from a spreadsheet (HR only): Lucca's or BambooHR's export,
// or HR's own file — choose it, see what each row does, import.
export default async function RecordImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "records.manage")) notFound();
  return (
    <div className="page narrow">
      <Link className="back" href="/chest/records"><Back />{t.record.back}</Link>
      <PageHeader title={t.recordImport.title} intro={<>{t.recordImport.body}<span className="intro-more">{t.recordImport.formats}</span></>} />
      <RecordImporter
        locale={locale}
        order={recordTargets}
        t={{ recordImport: t.recordImport, fields: t.record.fields, contracts: t.record.contracts, sexes: t.record.sexes, workingTimes: t.record.workingTimes, errors: t.errors, files: t.files, tables: t.tables }}
      />
    </div>
  );
}
