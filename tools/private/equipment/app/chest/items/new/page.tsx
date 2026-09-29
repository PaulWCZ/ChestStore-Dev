import * as chest from "@argentic/chest-sdk/chest";
import { can } from "../../../../lib/access.ts";
import { listCategories } from "../../../../lib/categories.ts";
import { db } from "../../../../lib/db.ts";
import { allFields } from "../../../../lib/fields.ts";
import { formHints } from "../../../../lib/items.ts";
import { viewer } from "../../../../lib/session.ts";
import { categoryName } from "../../../../lib/words.ts";
import { ItemForm } from "../item-form.tsx";

// Add equipment (managers). ?category= preselects one.
export default async function NewItem({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "items.manage")) return <main className="narrow"><div className="empty"><p>{t.errors.forbidden}</p></div></main>;
  const sql = db();
  const [categories, hints, fields] = await Promise.all([listCategories(sql, member), formHints(sql, member), allFields(sql)]);
  const wanted = (await searchParams).category;
  const first = categories.find(c => c.id === wanted) ?? categories[0];
  return (
    <main className="narrow">
      <h1 className="page-title">{t.form.newTitle}</h1>
      <ItemForm
        mode="new"
        initial={{ categoryId: first?.id ?? "", name: "", tag: "", serial: "", purchasedOn: "", price: "", supplier: "", warrantyUntil: "", notes: "", seats: "1", renewsOn: "", cost: "", period: "year", quantity: "0", minQuantity: "", extra: {}, count: "1", serials: "" }}
        categories={categories.map(c => ({ id: c.id, name: categoryName(c, t), icon: c.icon, kind: c.kind }))}
        fields={fields}
        nextTag={hints.nextTag}
        suppliers={hints.suppliers}
        currency={chest.currency()}
        t={{ form: t.form, item: t.item, periods: t.periods, errors: t.errors, common: t.common }}
      />
    </main>
  );
}
