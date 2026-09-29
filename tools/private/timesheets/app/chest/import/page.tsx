import { PageHeader } from "@argentic/chest-ui/components";
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
    <div className="page">
      <PageHeader title={t.importer.title} intro={t.importer.intro} />
      <Importer locale={locale} t={{ importer: t.importer, errors: t.errors, files: t.files }} />
    </div>
  );
}
