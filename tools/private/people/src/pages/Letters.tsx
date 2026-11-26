import { Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { listLetters, mergeFields, shown } from "../lib/letters.ts";
import { BackLink } from "./parts.tsx";

// HR's letters: written once with fields in braces, printed from a record
// (a certificat de travail, an attestation d'emploi…).
export async function lettersPage({ member, t }: PageContext): Promise<View> {
  if (!can(member, "records.manage")) return notFound();
  const list = (await listLetters(db(), member)).map(l => ({ id: l.id, ...shown(l, t) }));
  return {
    title: t.letters.title,
    body: (
      <div className="page narrow">
        <BackLink href="/chest/records">{t.record.back}</BackLink>
        <PageHeader title={t.letters.title} intro={t.letters.lead} />
        <Island name="LettersEditor" props={{ letters: list, fields: [...mergeFields], t: { letters: t.letters } }} />
      </div>
    ),
  };
}
