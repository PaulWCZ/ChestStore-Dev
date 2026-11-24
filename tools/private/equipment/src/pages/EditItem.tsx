import { chest } from "@argentic/chest-sdk/chest";
import { AppError, Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { format } from "../i18n/index.ts";
import { listCategories } from "../lib/categories.ts";
import { db } from "../lib/db.ts";
import { allFields } from "../lib/fields.ts";
import { formHints, itemDetail } from "../lib/items.ts";
import { categoryName, fieldName } from "../shared/words.ts";
import { currencyDecimals } from "../i18n/format.ts";
import { defaultCurrency } from "../lib/settings.ts";
import { knownCurrencies } from "../shared/model.ts";

// What the form shows of an amount: "1299.90" in its currency's decimals
// (it reads every writing back).
const amount = (minor: number | null, currency: string) => {
  const decimals = currencyDecimals(currency);
  return minor === null ? "" : (minor / 10 ** decimals).toFixed(decimals);
};

// Edit an item (managers).
export async function editItemPage({ member, t, param }: PageContext): Promise<View> {
  const sql = db();
  const detail = await itemDetail(sql, member, param("id")).catch((error: unknown) => {
    if (error instanceof AppError) notFound();
    throw error;
  });
  if (!detail.full) return notFound();
  const item = detail.item;
  const [categories, hints, fields, fallback] = await Promise.all([listCategories(sql, member), formHints(sql, member), allFields(sql), defaultCurrency(sql)]);
  const currency = item.currency ?? fallback;
  const title = format(t.form.editTitle, { name: item.name });
  return { title, body: (
    <div className="narrow">
      <h1 className="page-title">{title}</h1>
      <Island id={`item-edit-${item.id}`} name="ItemForm" props={{
        mode: "edit",
        id: item.id,
        initial: {
          categoryId: item.category.id, name: item.name, tag: item.tag, serial: item.serial ?? "", purchasedOn: item.purchasedOn ?? "", price: amount(item.priceCents, currency),
          supplier: item.supplier ?? "", warrantyUntil: item.warrantyUntil ?? "", notes: item.notes ?? "", seats: String(item.seats ?? 1), renewsOn: item.renewsOn ?? "",
          cost: amount(item.costCents, currency), period: item.period ?? "year", quantity: String(item.quantity ?? 0), minQuantity: item.minQuantity === null ? "" : String(item.minQuantity),
          extra: item.extra, count: "1", serials: "", currency,
        },
        categories: categories.map(c => ({ id: c.id, name: categoryName(c, t), icon: c.icon, kind: c.kind })),
        fields: fields.map(f => ({ id: f.id, categoryId: f.categoryId, type: f.type, name: fieldName(f, t) })),
        nextTag: hints.nextTag,
        suppliers: hints.suppliers,
        currencies: knownCurrencies(),
        today: chest.today(),
        t: { form: t.form, item: t.item, periods: t.periods, common: t.common, date: t.date },
      }} />
    </div>
  ) };
}
