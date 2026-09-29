"use client";

import { DateField, useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CategoryIcon, Give } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { limits, type FieldType, type IconName, type Kind } from "../../../lib/model.ts";
import { createItem, updateItem } from "../actions.ts";

export type CategoryOption = { id: string; name: string; icon: IconName; kind: Kind };
export type FieldOption = { id: string; categoryId: string; name: string; type: FieldType };
export type FormValues = {
  categoryId: string; name: string; tag: string; serial: string; purchasedOn: string; price: string; supplier: string;
  warrantyUntil: string; notes: string; seats: string; renewsOn: string; cost: string; period: "month" | "year";
  quantity: string; minQuantity: string; extra: Record<string, string>; count: string; serials: string;
};
type Words = { form: Catalogue["form"]; item: Catalogue["item"]; periods: Catalogue["periods"]; errors: Catalogue["errors"]; common: Catalogue["common"]; date: Catalogue["date"] };

// Add or edit an item. The category comes first (it decides the fields: a
// licence has seats and a renewal, a thing has a serial and a warranty,
// supplies a quantity; and each category its own fields — IMEI, RAM…);
// only the name is required. A new thing may come several at once (one
// serial number each, pasted from the delivery note), and may be given
// right away ("Add and give to someone").
export function ItemForm({ mode, id, initial, categories, fields, nextTag, suppliers, currency, today, t }: {
  mode: "new" | "edit"; id?: string; initial: FormValues; categories: CategoryOption[]; fields: FieldOption[]; nextTag: string; suppliers: string[]; currency: string;
  // The Chest's today (its time zone), for the date fields.
  today: string; t: Words;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setV(old => ({ ...old, [key]: value }));
  const chosen = categories.find(c => c.id === v.categoryId);
  const kind: Kind = chosen?.kind ?? "asset";
  const own = fields.filter(f => f.categoryId === v.categoryId);
  // In an edit, a thing stays a thing, a licence a licence, supplies supplies.
  const choices = mode === "edit" ? categories.filter(c => c.kind === (categories.find(k => k.id === initial.categoryId)?.kind ?? "asset")) : categories;
  const serialLines = v.serials.split(/\r?\n/u).map(x => x.trim()).filter(Boolean);
  const many = mode === "new" && kind === "asset" ? Math.max(Number(v.count) || 1, serialLines.length) : 1;

  function submit(andGive: boolean) {
    setError(null);
    start(async () => {
      const extra = Object.fromEntries(own.map(f => [f.id, v.extra[f.id] ?? ""]));
      const common = { categoryId: v.categoryId, name: v.name, tag: v.tag, supplier: v.supplier, notes: v.notes, extra };
      const input = kind === "licence"
        ? { ...common, seats: v.seats, renewsOn: v.renewsOn, cost: v.cost, period: v.period }
        : kind === "consumable"
          ? { ...common, purchasedOn: v.purchasedOn, quantity: v.quantity, minQuantity: v.minQuantity }
          : { ...common, serial: many > 1 ? "" : v.serial, purchasedOn: v.purchasedOn, price: v.price, warrantyUntil: v.warrantyUntil, ...(many > 1 ? { count: String(many), serials: serialLines } : {}) };
      if (mode === "new") {
        const r = await createItem(input);
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
        const made = r.value;
        if (made.length > 1) {
          const ids = made.map(m => m.id).join(",");
          toast({ text: format(t.form.createdMany, { count: made.length, first: made[0]!.tag, last: made.at(-1)!.tag }), action: { label: t.form.printLabels, run: () => router.push(`/chest/labels?ids=${ids}`) } });
          router.push("/chest/items?sort=newest");
          return;
        }
        toast(format(t.form.created, { name: v.name.trim(), tag: made[0]!.tag }));
        router.push(`/chest/items/${made[0]!.id}${andGive ? "?give=1" : ""}`);
      } else {
        const r = await updateItem(id!, input);
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
        toast(t.form.saved);
        router.push(`/chest/items/${id}`);
      }
    });
  }

  // A day: the kit's field, typed in the reader's language or chosen on a
  // calendar (never the browser's own date input).
  const day = (key: "purchasedOn" | "warrantyUntil" | "renewsOn", label: string) => (
    <div className="form-field">
      <DateField label={label} value={v[key] || null} onChange={d => set(key, d ?? "")} today={today} chips={false} labels={t.date} />
    </div>
  );

  const field = (key: keyof FormValues, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <div className="form-field">
      <label className="label" htmlFor={`f-${key}`}>{label}</label>
      <input id={`f-${key}`} className="field" value={v[key] as string} onChange={e => set(key, e.target.value as never)} aria-describedby={hint ? `h-${key}` : undefined} {...props} />
      {hint && <p id={`h-${key}`} className="hint">{hint}</p>}
    </div>
  );

  return (
    <form className="item-form" onSubmit={e => { e.preventDefault(); submit(false); }}>
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
          <input id="f-name" className="field big" value={v.name} onChange={e => set("name", e.target.value)} maxLength={limits.name}
            placeholder={kind === "licence" ? t.form.licenceNamePlaceholder : kind === "consumable" ? t.form.consumableNamePlaceholder : t.form.namePlaceholder} required autoFocus={mode === "new"} />
        </div>
        {kind === "licence" ? (
          <>
            {field("seats", t.item.seats, { type: "number", min: 1, max: limits.seats, inputMode: "numeric", required: true }, t.form.seatsHint)}
            {day("renewsOn", t.item.renews)}
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
        ) : kind === "consumable" ? (
          <>
            {field("quantity", t.form.quantity, { type: "number", min: 0, max: limits.quantity, inputMode: "numeric", required: true })}
            {field("minQuantity", t.form.minQuantity, { type: "number", min: 0, max: limits.quantity, inputMode: "numeric" }, t.form.minHint)}
          </>
        ) : (
          <>
            {mode === "new" && field("count", t.form.count, { type: "number", min: 1, max: limits.bulk, inputMode: "numeric" }, t.form.countHint)}
            {many > 1 ? (
              <div className="form-field">
                <label className="label" htmlFor="f-serials">{t.form.serials} <span className="muted">({t.common.optional})</span></label>
                <textarea id="f-serials" className="field mono" rows={Math.min(Math.max(many, 3), 10)} value={v.serials} onChange={e => set("serials", e.target.value)} aria-describedby="h-serials" spellCheck={false} />
                <p id="h-serials" className="hint">{t.form.serialsHint}</p>
              </div>
            ) : field("serial", t.item.serial, { maxLength: limits.serial, placeholder: t.form.serialPlaceholder, autoComplete: "off", spellCheck: false })}
            {day("purchasedOn", t.item.bought)}
            <div className="form-field">
              <label className="label" htmlFor="f-price">{t.item.price} <span className="muted">({currency})</span></label>
              <input id="f-price" className="field" value={v.price} onChange={e => set("price", e.target.value)} inputMode="decimal" placeholder={t.form.pricePlaceholder} maxLength={20} />
            </div>
            {day("warrantyUntil", t.item.warranty)}
          </>
        )}
        {own.map(f => f.type === "date" ? (
          <div className="form-field" key={f.id}>
            <DateField label={`${f.name} (${t.common.optional})`} value={v.extra[f.id] || null} today={today} chips={false} labels={t.date}
              onChange={d => setV(old => ({ ...old, extra: { ...old.extra, [f.id]: d ?? "" } }))} />
          </div>
        ) : (
          <div className="form-field" key={f.id}>
            <label className="label" htmlFor={`x-${f.id}`}>{f.name} <span className="muted">({t.common.optional})</span></label>
            <input id={`x-${f.id}`} className={f.type === "text" ? "field" : "field mono"} value={v.extra[f.id] ?? ""} maxLength={limits.fieldValue}
              type="text" inputMode={f.type === "number" ? "decimal" : undefined}
              onChange={e => { const value = e.target.value; setV(old => ({ ...old, extra: { ...old.extra, [f.id]: value } })); }} />
          </div>
        ))}
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
        {mode === "new" && kind === "asset" && many === 1 && (
          <button type="button" className="button quiet" disabled={pending || !v.name.trim() || !v.categoryId} onClick={() => submit(true)}><Give />{t.form.addAndGive}</button>
        )}
        <button type="submit" className="button" disabled={pending || !v.name.trim() || !v.categoryId}>
          {pending ? t.common.saving : mode === "new" ? (many > 1 ? format(t.form.createMany, { count: many }) : t.form.create) : t.common.save}
        </button>
      </div>
    </form>
  );
}
