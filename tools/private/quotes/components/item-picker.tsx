"use client";

import { useMemo, useState } from "react";
import type { Catalogue, Locale } from "../lib/i18n/index.ts";
import { formatMoney, formatRate } from "../lib/money.ts";
import type { ItemOption } from "../lib/views.ts";
import { Dialog } from "./dialog.tsx";
import { Search } from "./icons.tsx";

// Adding a line from the catalogue: its words, unit, price and VAT rate
// copied onto the document (which keeps them if the catalogue changes).
export function ItemPicker({ t, items, currency, locale, onPick, onClose }: { t: Catalogue; items: ItemOption[]; currency: string; locale: Locale; onPick: (item: ItemOption) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase();
    const needle = fold(q.trim());
    return items.filter(i => !needle || fold(i.name + " " + i.description).includes(needle)).slice(0, 200);
  }, [q, items]);
  return (
    <Dialog open title={t.picker.itemTitle} closeLabel={t.shell.close} onClose={onClose}>
      <div className="picker">
        <div className="search">
          <Search />
          <label className="visually-hidden" htmlFor="item-q">{t.list.search}</label>
          <input id="item-q" className="field" type="search" value={q} placeholder={t.picker.itemSearch} onChange={e => setQ(e.target.value)} autoFocus />
        </div>
        {shown.length > 0 ? (
          <ul>
            {shown.map(i => (
              <li key={i.id}>
                <button type="button" onClick={() => onPick(i)}>
                  <strong>{i.name}</strong>
                  <span className="price">{formatMoney(i.unitPrice, currency, locale)}{i.unit ? " / " + i.unit : ""}</span>
                  <span className="sub">{i.description.split("\n")[0]}</span>
                  <span className="sub">{t.picker.vat} {formatRate(i.vatRate, locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{items.length === 0 ? t.picker.noItems : t.list.none}</p>}
        <a className="link-button" href="/chest/catalogue">{t.picker.manage}</a>
      </div>
    </Dialog>
  );
}
