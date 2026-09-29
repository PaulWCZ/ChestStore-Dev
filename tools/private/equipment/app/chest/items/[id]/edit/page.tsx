import * as chest from "@argentic/chest-sdk/chest";
import { forbidden, notFound } from "next/navigation";
import { AppError } from "../../../../../lib/app-error.ts";
import { can } from "../../../../../lib/access.ts";
import { listCategories } from "../../../../../lib/categories.ts";
import { db } from "../../../../../lib/db.ts";
import { format } from "../../../../../lib/i18n/index.ts";
import { allFields } from "../../../../../lib/fields.ts";
import { formHints, itemDetail } from "../../../../../lib/items.ts";
import { viewer } from "../../../../../lib/session.ts";
import { categoryName, fieldName } from "../../../../../lib/words.ts";
import { ItemForm } from "../../item-form.tsx";

const amount = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));

export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "items.manage")) forbidden();
  const sql = db();
  const detail = await itemDetail(sql, member, (await params).id).catch(error => {
    if (error instanceof AppError) notFound();
    throw error;
  });
  if (!detail.full) notFound();
  const item = detail.item;
  const [categories, hints, fields] = await Promise.all([listCategories(sql, member), formHints(sql, member), allFields(sql)]);
  return (
    <div className="narrow">
      <h1 className="page-title">{format(t.form.editTitle, { name: item.name })}</h1>
      <ItemForm
        mode="edit"
        id={item.id}
        initial={{
          categoryId: item.category.id, name: item.name, tag: item.tag, serial: item.serial ?? "", purchasedOn: item.purchasedOn ?? "", price: amount(item.priceCents),
          supplier: item.supplier ?? "", warrantyUntil: item.warrantyUntil ?? "", notes: item.notes ?? "", seats: String(item.seats ?? 1), renewsOn: item.renewsOn ?? "",
          cost: amount(item.costCents), period: item.period ?? "year", quantity: String(item.quantity ?? 0), minQuantity: item.minQuantity === null ? "" : String(item.minQuantity),
          extra: item.extra, count: "1", serials: "",
        }}
        categories={categories.map(c => ({ id: c.id, name: categoryName(c, t), icon: c.icon, kind: c.kind }))}
        fields={fields.map(f => ({ ...f, name: fieldName(f, t) }))}
        nextTag={hints.nextTag}
        suppliers={hints.suppliers}
        currency={chest.currency()}
        today={chest.today()}
        t={{ form: t.form, item: t.item, periods: t.periods, errors: t.errors, common: t.common, date: t.date }}
      />
    </div>
  );
}
