"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "../../../components/dialog.tsx";
import { Box, Plus, Upload } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import type { Item } from "../../../lib/items.ts";
import { formatMoney, formatRate, inputAmount, vatRates } from "../../../lib/money.ts";
import { addItem, archiveItem, updateItem } from "../actions.ts";

// The catalogue: what the company sells, priced excluding VAT, ready to put
// on a quote in one click.
type Fields = { name: string; description: string; unit: string; unitPrice: string; vatRate: number; goods: boolean };

export function CatalogueView({ t, locale, items, archived, canWrite, currency }: { t: Catalogue; locale: Locale; items: Item[]; archived: boolean; canWrite: boolean; currency: string }) {
  const c = t.catalogue;
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<{ id: string | null; fields: Fields } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = (item: Item | null) => {
    setError(null);
    setEditing({ id: item?.id ?? null, fields: item ? { name: item.name, description: item.description, unit: item.unit, unitPrice: inputAmount(item.unitPrice, currency, locale), vatRate: item.vatRate, goods: item.goods } : { name: "", description: "", unit: "", unitPrice: "", vatRate: 2000, goods: false } });
  };
  const set = (patch: Partial<Fields>) => setEditing(e => (e ? { ...e, fields: { ...e.fields, ...patch } } : e));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    const result = editing.id ? await updateItem(editing.id, editing.fields) : await addItem(editing.fields);
    setBusy(false);
    if (!result.ok) return setError(format(t.errors[result.error], result.values ?? {}));
    setEditing(null);
    toast(editing.id ? c.saved : format(c.added, { name: result.value.name }));
    router.refresh();
  }
  async function archive(item: Item, value: boolean) {
    const result = await archiveItem(item.id, value);
    if (!result.ok) return toast(t.errors[result.error]);
    toast(value ? format(c.archivedToast, { name: item.name }) : c.restored, value ? { label: t.common.undo, run: () => void archiveItem(item.id, false).then(() => router.refresh()) } : undefined);
    router.refresh();
  }
  const units = Object.values(t.pdf.units).map(u => u.one);
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
        {canWrite && <div className="actions"><a className="button quiet" href="/chest/import?kind=items"><Upload />{c.import}</a><button type="button" className="button" onClick={() => open(null)}><Plus />{c.add}</button></div>}
      </div>
      <nav className="filters" aria-label={t.list.filters}>
        <a href="/chest/catalogue" aria-current={!archived ? "true" : undefined}>{c.active}</a>
        <a href="/chest/catalogue?archived=1" aria-current={archived ? "true" : undefined}>{c.archived}</a>
      </nav>
      {items.length === 0 ? (
        <div className="empty">
          <Box />
          <h2>{archived ? c.noArchived : c.empty.title}</h2>
          {!archived && <p>{c.empty.body}</p>}
          {canWrite && !archived && <div className="actions"><button type="button" className="button" onClick={() => open(null)}><Plus />{c.add}</button><a className="button quiet" href="/chest/import?kind=items"><Upload />{c.import}</a></div>}
        </div>
      ) : (
        <div className="ledger">
          <div className="ledger-head ledger-row items-row" aria-hidden="true">
            <span>{c.name}</span><span>{c.unit}</span><span className="amount">{c.price}</span><span className="amount">{c.vat}</span><span />
          </div>
          <ul className="plain">
            {items.map(i => (
              <li key={i.id} className="ledger-row items-row">
                <span className="who">{i.name}{i.description && <span className="what"> — {i.description.split("\n")[0]}</span>}</span>
                <span className="date">{i.unit}</span>
                <span className="amount">{formatMoney(i.unitPrice, currency, locale)}</span>
                <span className="amount">{formatRate(i.vatRate, locale)}</span>
                <span className="state">
                  {canWrite && (archived
                    ? <button type="button" className="link-button" onClick={() => void archive(i, false)}>{c.restore}</button>
                    : <button type="button" className="link-button" onClick={() => open(i)} aria-label={format(c.editNamed, { name: i.name })}>{c.edit}</button>)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Dialog open={editing !== null} title={editing?.id ? c.editTitle : c.add} closeLabel={t.shell.close} onClose={() => setEditing(null)}>
        {editing && (
          <form className="form-grid" onSubmit={submit} noValidate>
            <div className="field-row">
              <label htmlFor="i-name">{c.name}</label>
              <input id="i-name" className="field" value={editing.fields.name} maxLength={160} required autoFocus onChange={e => set({ name: e.target.value })} />
            </div>
            <div className="field-row">
              <label htmlFor="i-description">{c.description}</label>
              <textarea id="i-description" className="field" rows={3} value={editing.fields.description} maxLength={2000} placeholder={c.descriptionPlaceholder} onChange={e => set({ description: e.target.value })} />
            </div>
            <div className="field-row third">
              <label htmlFor="i-price">{c.price}</label>
              <input id="i-price" className="field num" inputMode="decimal" value={editing.fields.unitPrice} onChange={e => set({ unitPrice: e.target.value })} />
            </div>
            <div className="field-row third">
              <label htmlFor="i-unit">{c.unit}</label>
              <input id="i-unit" className="field" list="item-units" value={editing.fields.unit} maxLength={20} onChange={e => set({ unit: e.target.value })} />
              <datalist id="item-units">{units.map(u => <option key={u} value={u} />)}</datalist>
            </div>
            <div className="field-row third">
              <label htmlFor="i-vat">{c.vat}</label>
              <select id="i-vat" className="field" value={editing.fields.vatRate} onChange={e => set({ vatRate: Number(e.target.value) })}>
                {vatRates.map(r => <option key={r} value={r}>{formatRate(r, locale)}</option>)}
              </select>
            </div>
            <fieldset className="choice">
              <legend>{c.kind}</legend>
              <div className="two-col">
                <label className="option"><input type="radio" name="goods" checked={!editing.fields.goods} onChange={() => set({ goods: false })} /><span>{c.service}</span><span className="sub">{c.serviceHint}</span></label>
                <label className="option"><input type="radio" name="goods" checked={editing.fields.goods} onChange={() => set({ goods: true })} /><span>{c.goods}</span><span className="sub">{c.goodsHint}</span></label>
              </div>
            </fieldset>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="dialog-actions">
              {editing.id && <button type="button" className="button ghost" onClick={() => { const item = items.find(i => i.id === editing.id); setEditing(null); if (item) void archive(item, true); }}>{c.archive}</button>}
              <button type="button" className="button quiet" onClick={() => setEditing(null)}>{t.common.cancel}</button>
              <button type="submit" className="button" disabled={busy}>{editing.id ? t.common.save : c.add}</button>
            </div>
          </form>
        )}
      </Dialog>
    </main>
  );
}
