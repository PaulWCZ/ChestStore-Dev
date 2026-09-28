import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { viewer } from "../../../lib/session.ts";
import { listSpaces } from "../../../lib/spaces.ts";
import { Importer } from "./importer.tsx";

// Import: from Notion (its "Markdown & CSV" zip, as it comes), Obsidian or
// any .md files, into a new space or an existing one.
export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "import")) {
    return <main className="page narrow"><div className="empty"><p>{t.errors.forbidden}</p></div></main>;
  }
  const spaces = (await listSpaces(db(), member)).filter(s => s.access === "write").map(s => ({ id: s.id, name: s.name }));
  const wanted = (await searchParams)["space"];
  return (
    <main className="page narrow">
      <h1>{t.importer.title}</h1>
      <p className="lead">{t.importer.lead}</p>
      <Importer spaces={spaces} initialSpace={spaces.some(s => s.id === wanted) ? wanted! : null} locale={locale} t={{ importer: t.importer, errors: t.errors }} />
    </main>
  );
}
