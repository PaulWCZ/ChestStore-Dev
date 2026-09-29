import { PageHeader } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { listLetters, mergeFields, shown } from "../../../../lib/letters.ts";
import { viewer } from "../../../../lib/session.ts";
import { LettersEditor } from "./letters-editor.tsx";

// HR's letters: written once with fields in braces, printed from a record
// (a certificat de travail, an attestation d'emploi…).
export default async function LettersPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "records.manage")) notFound();
  const list = (await listLetters(db(), member)).map(l => ({ id: l.id, ...shown(l, t) }));
  return (
    <div className="page narrow">
      <Link className="back" href="/chest/records"><Back />{t.record.back}</Link>
      <PageHeader title={t.letters.title} intro={t.letters.lead} />
      <LettersEditor letters={list} fields={[...mergeFields]} t={{ letters: t.letters, errors: t.errors }} />
    </div>
  );
}
