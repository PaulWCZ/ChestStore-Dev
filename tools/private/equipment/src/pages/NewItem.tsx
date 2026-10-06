import { chest } from "@argentic/chest-sdk/chest";
import { Island, type PageContext, type View } from "@argentic/chest-app";
import { listCategories } from "../lib/categories.ts";
import { db } from "../lib/db.ts";
import { allFields } from "../lib/fields.ts";
import { formHints } from "../lib/items.ts";
import { categoryName, fieldName } from "../shared/words.ts";

// Add equipment (managers). ?category= preselects one.
export async function newItemPage({ member, t, query }: PageContext): Promise<View> {
  const sql = db();
  const [categories, hints, fields] = await Promise.all([listCategories(sql, member), formHints(sql, member), allFields(sql)]);
  const wanted = query("category");
  const first = categories.find(c => c.id === wanted) ?? categories[0];
  return { title: t.form.newTitle, body: (
    <div className="narrow">
      <h1 className="page-title">{t.form.newTitle}</h1>
      <Island id="item-new" name="ItemForm" props={{
        mode: "new",
        id: null,
        initial: { categoryId: first?.id ?? "", name: "", tag: "", serial: "", purchasedOn: "", price: "", supplier: "", warrantyUntil: "", notes: "", seats: "1", renewsOn: "", cost: "", period: "year", quantity: "0", minQuantity: "", extra: {}, count: "1", serials: "" },
        categories: categories.map(c => ({ id: c.id, name: categoryName(c, t), icon: c.icon, kind: c.kind })),
        fields: fields.map(f => ({ id: f.id, categoryId: f.categoryId, type: f.type, name: fieldName(f, t) })),
        nextTag: hints.nextTag,
        suppliers: hints.suppliers,
        currency: chest.currency,
        today: chest.today(),
        t: { form: t.form, item: t.item, periods: t.periods, common: t.common, date: t.date },
      }} />
    </div>
  ) };
}
