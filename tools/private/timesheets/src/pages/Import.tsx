import { forbidden, Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader } from "@argentic/chest-ui/components";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";

// Moving in from Toggl Track, Clockify or Harvest (/chest/import, managers).
export async function importPage({ member, locale: lang, t }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(lang);
  if (!can(member, "import")) forbidden();
  return {
    title: t.importer.title,
    body: (
      <div className="page">
        <PageHeader title={t.importer.title} intro={t.importer.intro} />
        <Island name="Importer" props={{ locale, t: { importer: t.importer, errors: t.errors, files: t.kit.files } }} />
      </div>
    ),
  };
}
