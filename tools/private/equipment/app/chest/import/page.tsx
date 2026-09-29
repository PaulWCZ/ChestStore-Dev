import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";
import { Importer } from "./importer.tsx";

export default async function ImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) notFound();
  return (
    <div className="narrow">
      <h1 className="page-title">{t.importer.title}</h1>
      <p className="muted lead">{t.importer.intro}</p>
      <Importer t={{ importer: t.importer, errors: t.errors, status: t.status, categories: t.categories, files: t.files, table: t.table }} locale={locale} />
    </div>
  );
}
