import { chest } from "@argentic/chest-sdk/chest";
import { forbidden } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { categoryCounts } from "../../../lib/categories.ts";
import { db } from "../../../lib/db.ts";
import { allFields } from "../../../lib/fields.ts";
import { format } from "../../../lib/i18n/index.ts";
import { currentCharter } from "../../../lib/receipts.ts";
import { viewer } from "../../../lib/session.ts";
import { CategoriesView } from "./categories-view.tsx";
import { RulesView } from "./rules-view.tsx";
import { charterText, fieldName } from "../../../lib/words.ts";

// The categories (managers): rename, change the icon, add, remove an empty
// one; each one's own fields. The rules people accept when they receive
// something.
export default async function Settings() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) forbidden();
  const sql = db();
  const [counts, fields, charter] = await Promise.all([categoryCounts(sql, member), allFields(sql), currentCharter(sql)]);
  return (
    <div className="narrow">
      <h1 className="page-title">{t.settings.title}</h1>
      <p className="muted lead">{t.settings.intro}</p>
      <CategoriesView
        categories={counts.map(c => ({
          id: c.id, name: c.name ?? "", builtIn: c.key ? t.categories[c.key] : null, icon: c.icon, kind: c.kind, total: c.total, membersSee: c.membersSee,
          fields: fields.filter(f => f.categoryId === c.id).map(f => ({ id: f.id, name: fieldName(f, t), type: f.type })),
        }))}
        t={{ settings: t.settings, icons: t.icons, errors: t.errors, common: t.common }}
        locale={locale}
      />
      <p className="small muted">{format(t.settings.currency, { currency: chest.currency })}</p>
      <RulesView body={charter ? charterText(charter, t) : ""} t={{ settings: t.settings, errors: t.errors, common: t.common }} />
    </div>
  );
}
