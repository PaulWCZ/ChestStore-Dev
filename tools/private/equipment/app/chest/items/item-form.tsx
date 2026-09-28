"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CategoryIcon } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { limits, type IconName } from "../../../lib/model.ts";
import { createItem, updateItem } from "../actions.ts";

export type CategoryOption = { id: string; name: string; icon: IconName; licence: boolean };
export type FormValues = {
  categoryId: string; name: string; tag: string; serial: string; purchasedOn: string; price: string; supplier: string;
  warrantyUntil: string; notes: string; seats: string; renewsOn: string; cost: string; period: "month" | "year";
};
type Words = { form: Catalogue["form"]; item: Catalogue["item"]; periods: Catalogue["periods"]; errors: Catalogue["errors"]; common: Catalogue["common"] };

// Add or edit an item. The category comes first (it decides the fields: a
// licence has seats and a renewal, a thing has a serial and a warranty);
// only the name is required.
export function ItemForm({ mode, id, initial, categories, nextTag, suppliers, currency, t }: {
  mode: "new" | "edit"; id?: string; initial: FormValues; categories: CategoryOption[]; nextTag: string; suppliers: string[]; currency: string; t: Words;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setV(old => ({ ...old, [key]: value }));
  const chosen = categories.find(c => c.id === v.categoryId);
  const licence = chosen?.licence ?? false;
  // In an edit, a thing stays a thing and a licence a licence.
  const choices = mode === "edit" ? categories.filter(c => c.licence === (categories.find(k => k.id === initial.categoryId)?.licence ?? false)) : categories;

  function submit() {
    setError(null);
    start(async () => {
      const input = licence
        ? { categoryId: v.categoryId, name: v.name, tag: v.tag, supplier: v.supplier, notes: v.notes, seats: v.seats, renewsOn: v.renewsOn, cost: v.cost, period: v.period }
        : { categoryId: v.categoryId, name: v.name, tag: v.tag, serial: v.serial, purchasedOn: v.purchasedOn, price: v.price, supplier: v.supplier, warrantyUntil: v.warrantyUntil, notes: v.notes };
      if (mode === "new") {
        const r = await createItem(input);
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
        toast(format(t.form.created, { name: v.name.trim(), tag: r.value.tag }));
        router.push(`/chest/items/${r.value.id}`);
      } else {
        const r = await updateItem(id!, input);
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
        toast(t.form.saved);
        router.push(`/chest/items/${id}`);
      }
    });
  }

  const field = (key: keyof FormValues, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <div className="form-field">
      <label className="label" htmlFor={`f-${key}`}>{label}</label>
      <input id={`f-${key}`} className="field" value={v[key]} onChange={e => set(key, e.target.value as never)} aria-describedby={hint ? `h-${key}` : undefined} {...props} />
      {hint && <p id={`h-${key}`} className="hint">{hint}</p>}
    </div>
  );

  return (
    <form className="item-form" onSubmit={e => { e.preventDefault(); submit(); }}>
      <fieldset className="kinds">
        <legend className="label">{t.form.what}</legend>
        <div className="kind-grid">
          {choices.map(c => (
            <label key={c.id} className={c.id === v.categoryId ? "kind picked" : "kind"}>
              <input type="radio" name="category" value={c.id} checked={c.id === v.categoryId} onChange={() => set("categoryId", c.id)} />
              <CategoryIcon name={c.icon} />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="form-grid">
        <div className="form-field wide">
          <label className="label" htmlFor="f-name">{t.form.name}</label>
          <input id="f-name" className="field big" value={v.name} onChange={e => set("name", e.target.value)} maxLength={limits.name} placeholder={licence ? t.form.licenceNamePlaceholder : t.form.namePlaceholder} required autoFocus={mode === "new"} />
        </div>
        {licence ? (
          <>
            {field("seats", t.item.seats, { type: "number", min: 1, max: limits.seats, inputMode: "numeric", required: true }, t.form.seatsHint)}
            {field("renewsOn", t.item.renews, { type: "date" })}
            <div className="form-field">
              <label className="label" htmlFor="f-cost">{t.item.cost} <span className="muted">({currency})</span></label>
              <div className="joined">
                <input id="f-cost" className="field" value={v.cost} onChange={e => set("cost", e.target.value)} inputMode="decimal" placeholder={t.form.pricePlaceholder} maxLength={20} />
                <select className="field" aria-label={t.item.cost} value={v.period} onChange={e => set("period", e.target.value as "month" | "year")}>
                  <option value="month">{t.periods.month}</option>
                  <option value="year">{t.periods.year}</option>
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            {field("serial", t.item.serial, { maxLength: limits.serial, placeholder: t.form.serialPlaceholder, autoComplete: "off", spellCheck: false })}
            {field("purchasedOn", t.item.bought, { type: "date" })}
            <div className="form-field">
              <label className="label" htmlFor="f-price">{t.item.price} <span className="muted">({currency})</span></label>
              <input id="f-price" className="field" value={v.price} onChange={e => set("price", e.target.value)} inputMode="decimal" placeholder={t.form.pricePlaceholder} maxLength={20} />
            </div>
            {field("warrantyUntil", t.item.warranty, { type: "date" })}
          </>
        )}
        <div className="form-field">
          <label className="label" htmlFor="f-supplier">{t.item.supplier} <span className="muted">({t.common.optional})</span></label>
          <input id="f-supplier" className="field" list="suppliers" value={v.supplier} onChange={e => set("supplier", e.target.value)} maxLength={limits.supplier} placeholder={t.form.supplierPlaceholder} />
          <datalist id="suppliers">{suppliers.map(s => <option key={s} value={s} />)}</datalist>
        </div>
        {field("tag", t.item.tag, { maxLength: 32, placeholder: format(t.form.tagPlaceholder, { tag: nextTag }), autoComplete: "off", spellCheck: false, className: "field mono" }, mode === "new" ? t.form.tagHint : undefined)}
        <div className="form-field wide">
          <label className="label" htmlFor="f-notes">{t.item.notes} <span className="muted">({t.common.optional})</span></label>
          <textarea id="f-notes" className="field" rows={3} value={v.notes} onChange={e => set("notes", e.target.value)} maxLength={limits.notes} placeholder={t.form.notesPlaceholder} />
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end form-actions">
        <Link className="button quiet" href={mode === "edit" ? `/chest/items/${id}` : "/chest/items"}>{t.form.cancel}</Link>
        <button type="submit" className="button" disabled={pending || !v.name.trim() || !v.categoryId}>{pending ? t.common.saving : mode === "new" ? t.form.create : t.common.save}</button>
      </div>
    </form>
  );
}
