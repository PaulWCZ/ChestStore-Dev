import { call, toast } from "@argentic/chest-app/client";
import { DataTable, Dialog, EmptyState, PageHeader, Tabs } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Box, Plus, Upload } from "../components/icons.tsx";
import { format } from "../i18n/format.ts";
import type { Catalogue, Locale } from "../i18n/index.ts";
import type { Item } from "../lib/items.ts";
import { formatMoney, formatRate, inputAmount, vatRates } from "../shared/money.ts";

export type CatalogueWords = Pick<Catalogue, "catalogue" | "list" | "kit" | "errors" | "common"> & { units: readonly string[] };

// The catalogue: what the company sells, priced excluding VAT, ready to put
// on a quote in one click. An item is changed in a dialog that asks before
// losing what was typed; archiving it offers Undo.
type Fields = { name: string; description: string; unit: string; unitPrice: string; vatRate: number; goods: boolean };

export function CatalogueView({ t, locale, items, archived, canWrite, currency }: { t: CatalogueWords; locale: Locale; items: readonly Item[]; archived: boolean; canWrite: boolean; currency: string }) {
  const c = t.catalogue;
  const [editing, setEditing] = useState<{ id: string | null; fields: Fields; initial: Fields } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = (item: Item | null) => {
    setError(null);
    const fields: Fields = item ? { name: item.name, description: item.description, unit: item.unit, unitPrice: inputAmount(item.unitPrice, currency, locale), vatRate: item.vatRate, goods: item.goods } : { name: "", description: "", unit: "", unitPrice: "", vatRate: 2000, goods: false };
    setEditing({ id: item?.id ?? null, fields, initial: fields });
  };
  const set = (patch: Partial<Fields>) => setEditing(e => (e ? { ...e, fields: { ...e.fields, ...patch } } : e));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    const result = editing.id ? await call("updateItem", { id: editing.id, ...editing.fields }, { quiet: true }) : await call("addItem", editing.fields, { quiet: true });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setEditing(null);
    toast({ id: `item-${result.value.id}`, text: editing.id ? c.saved : format(c.added, { name: result.value.name }) });
  }
  async function archive(item: Item, value: boolean) {
    const result = await call("archiveItem", { id: item.id, archived: value });
    if (!result.ok) return;
    toast(value
      ? { id: `archive-${item.id}`, text: format(c.archivedToast, { name: item.name }), undo: async () => { const back = await call("archiveItem", { id: item.id, archived: false }, { quiet: true }); return back.ok || back.message; } }
      : { id: `archive-${item.id}`, text: c.restored });
  }
  const units = t.units;
  return (
    <div className="page">
      <PageHeader size="m" title={c.title} intro={c.intro}
        secondary={canWrite ? <a className="button quiet" href="/chest/import?kind=items"><Upload />{c.import}</a> : undefined}
        action={canWrite ? <button type="button" className="button" onClick={() => open(null)}><Plus />{c.add}</button> : undefined} />
      <div className="view-tabs">
        <Tabs label={t.list.filters} current={archived ? "archived" : "active"}
          items={[{ id: "active", label: c.active, href: "/chest/catalogue" }, { id: "archived", label: c.archived, href: "/chest/catalogue?archived=1" }]} />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<Box />} title={archived ? c.noArchived : c.empty.title} body={archived ? undefined : c.empty.body}
          action={canWrite && !archived ? <><button type="button" className="button" onClick={() => open(null)}><Plus />{c.add}</button><a className="button quiet" href="/chest/import?kind=items"><Upload />{c.import}</a></> : undefined} />
      ) : (
        <DataTable
          caption={archived ? `${c.title} · ${c.archived}` : c.title}
          rows={items}
          rowKey={i => i.id}
          labels={t.kit.table}
          columns={[
            { key: "name", label: c.name, rowHeader: true, value: i => i.name, render: i => <><span className="who">{i.name}</span>{i.description && <span className="what">{i.description.split("\n")[0]}</span>}</> },
            { key: "unit", label: c.unit, hideOnPhone: true, width: "narrow", render: i => <span className="date">{i.unit}</span> },
            { key: "price", label: c.price, align: "end", width: "narrow", value: i => i.unitPrice, render: i => <span className="amount">{formatMoney(i.unitPrice, currency, locale)}</span> },
            { key: "vat", label: c.vat, align: "end", width: "narrow", hideOnPhone: true, value: i => i.vatRate, render: i => <span className="num">{formatRate(i.vatRate, locale)}</span> },
            ...(canWrite ? [{ key: "act", label: c.actions, align: "end" as const, width: "narrow" as const, render: (i: Item) => archived
              ? <button type="button" className="link-button" onClick={() => void archive(i, false)}>{c.restore}</button>
              : <button type="button" className="link-button" onClick={() => open(i)} aria-label={format(c.editNamed, { name: i.name })}>{c.edit}</button> }] : []),
          ]}
        />
      )}
      <Dialog open={editing !== null} title={editing?.id ? c.editTitle : c.add} onClose={() => setEditing(null)} dirty={editing !== null && JSON.stringify(editing.fields) !== JSON.stringify(editing.initial)} labels={t.kit.dialog}>
        {editing && (
          <form className="form-grid" onSubmit={submit} noValidate>
            <div className="field-row">
              <label htmlFor="i-name">{c.name}</label>
              <input id="i-name" className="field" value={editing.fields.name} maxLength={160} required onChange={e => set({ name: e.target.value })} />
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
    </div>
  );
}
