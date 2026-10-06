import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { listSpaces } from "../lib/spaces.ts";

// Import: from Notion (its "Markdown & CSV" zip, as it comes), Obsidian or
// any .md files, into a new space or an existing one.
export async function importPage({ member, locale, t, query }: PageContext<MemberContext>): Promise<View> {
  if (!can(member, "import")) {
    return { title: t.importer.title, body: <div className="page narrow"><EmptyState headingLevel={1} title={t.errors.forbidden} /></div> };
  }
  const spaces = (await listSpaces(db(), member)).filter(s => s.access === "write").map(s => ({ id: s.id, name: s.name }));
  const wanted = query("space");
  return { title: t.importer.title, body: (
    <div className="page narrow">
      <h1>{t.importer.title}</h1>
      <p className="lead">{t.importer.lead}</p>
      <Island name="Importer" props={{ spaces, initialSpace: spaces.some(s => s.id === wanted) ? wanted! : null, locale, t: { importer: t.importer, files: t.kit.files, unavailable: t.errors.unavailable, unknown: t.errors.unknown } }} />
    </div>
  ) };
}
