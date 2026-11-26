import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { can } from "../lib/access.ts";
import { recordTargets } from "../lib/record-import.ts";
import { BackLink } from "./parts.tsx";

// HR records from a spreadsheet (HR only): Lucca's or BambooHR's export,
// or HR's own file — choose it, see what each row does, import.
export function recordImportPage({ member, locale, t }: PageContext): Promise<View> {
  if (!can(member, "records.manage")) return notFound();
  return Promise.resolve({
    title: t.recordImport.title,
    body: (
      <div className="page narrow">
        <BackLink href="/chest/records">{t.record.back}</BackLink>
        <PageHeader title={t.recordImport.title} intro={<>{t.recordImport.body}<span className="intro-more">{t.recordImport.formats}</span></>} />
        <Island
          name="RecordImporter"
          props={{
            locale,
            order: [...recordTargets],
            t: { recordImport: t.recordImport, fields: t.record.fields, contracts: t.record.contracts, sexes: t.record.sexes, workingTimes: t.record.workingTimes, files: t.files, tables: t.tables },
          }}
        />
      </div>
    ),
  });
}
