import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Back } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { listSynonyms } from "../lib/synonyms.ts";

// Words that mean the same, for search: one line per group, editors only.
export async function synonymsPage({ member, t }: PageContext<MemberContext>): Promise<View> {
  if (!can(member, "write")) return notFound();
  const groups = await listSynonyms(db(), member);
  return { title: t.synonyms.title, body: (
    <div className="page narrow">
      <a className="back" href="/chest/search"><Back />{t.synonyms.back}</a>
      <h1>{t.synonyms.title}</h1>
      <p className="lead">{t.synonyms.intro}</p>
      <Island name="SynonymsEditor" props={{ initial: groups, t: { synonyms: t.synonyms } }} />
    </div>
  ) };
}
