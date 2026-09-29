import { forbidden } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { Importer } from "./importer.tsx";

// Moving in from Toggl Track, Clockify or Harvest (managers).
export default async function ImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "import")) forbidden();
  return (
    <main className="page">
      <h1>{t.importer.title}</h1>
      <p className="lead">{t.importer.intro}</p>
      <Importer locale={locale} t={{ importer: t.importer, errors: t.errors }} />
    </main>
  );
}
