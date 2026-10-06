import { chest } from "@argentic/chest-sdk/chest";
import { Island, type PageContext, type View } from "@argentic/chest-app";
import { format, localeOf } from "../i18n/index.ts";
import { categoryCounts } from "../lib/categories.ts";
import { db } from "../lib/db.ts";
import { allFields } from "../lib/fields.ts";
import { currentCharter } from "../lib/receipts.ts";
import { charterText, fieldName } from "../shared/words.ts";

// The categories (managers): rename, change the icon, add, remove an empty
// one; each one's own fields. The rules people accept when they receive
// something.
export async function settingsPage({ member, locale: language, t }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const [counts, fields, charter] = await Promise.all([categoryCounts(sql, member), allFields(sql), currentCharter(sql)]);
  return { title: t.settings.title, body: (
    <div className="narrow">
      <h1 className="page-title">{t.settings.title}</h1>
      <p className="muted lead">{t.settings.intro}</p>
      <Island id="i-categories" name="CategoriesView" props={{
        categories: counts.map(c => ({
          id: c.id, name: c.name ?? "", builtIn: c.key ? t.categories[c.key] : null, icon: c.icon, kind: c.kind, total: c.total, membersSee: c.membersSee,
          fields: fields.filter(f => f.categoryId === c.id).map(f => ({ id: f.id, name: fieldName(f, t), type: f.type })),
        })),
        t: { settings: t.settings, icons: t.icons, common: t.common },
        locale,
      }} />
      <p className="small muted">{format(t.settings.currency, { currency: chest.currency })}</p>
      <Island id="i-rules" name="RulesView" props={{ body: charter ? charterText(charter, t) : "", t: { settings: t.settings, common: t.common } }} />
    </div>
  ) };
}
