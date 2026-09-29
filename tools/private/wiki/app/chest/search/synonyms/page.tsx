import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { listSynonyms } from "../../../../lib/synonyms.ts";
import { viewer } from "../../../../lib/session.ts";
import { SynonymsEditor } from "./synonyms-editor.tsx";

// Words that mean the same, for search: one line per group, editors only.
export default async function SynonymsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "write")) notFound();
  const groups = await listSynonyms(db(), member);
  return (
    <div className="page narrow synonyms">
      <Link className="back" href="/chest/search"><Back />{t.synonyms.back}</Link>
      <h1>{t.synonyms.title}</h1>
      <p className="lead">{t.synonyms.intro}</p>
      <SynonymsEditor initial={groups} t={{ synonyms: t.synonyms, errors: t.errors }} />
    </div>
  );
}
