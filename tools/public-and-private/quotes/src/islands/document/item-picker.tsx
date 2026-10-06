import { Dialog, SearchBox } from "@argentic/chest-ui/components";
import { useState } from "react";
import { useFound } from "./found.ts";
import type { Locale } from "../../i18n/index.ts";
import { formatMoney, formatRate } from "../../shared/money.ts";
import type { ItemOption } from "../../lib/views.ts";
import type { DocWords } from "../../lib/views.ts";

// Adding a line from the catalogue: its words, unit, price and VAT rate
// copied onto the document (which keeps them if the catalogue changes).
// The catalogue is searched on the server as one types.
export function ItemPicker({ t, currency, locale, onPick, onClose }: { t: DocWords; currency: string; locale: Locale; onPick: (item: ItemOption) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const found = useFound<ItemOption>("findItems", q, {});
  const shown = found.rows ?? [];
  return (
    <Dialog open title={t.picker.itemTitle} onClose={onClose} labels={t.kit.dialog}>
      <div className="picker">
        <SearchBox action="" id="item-q" value={q} shortcut={false} onSearch={setQ} labels={{ ...t.kit.search, placeholder: t.picker.itemSearch }} maxLength={80} />
        {found.rows === null ? <p className="muted" role="status">{t.picker.searching}</p> : shown.length > 0 ? (
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
        ) : <p className="muted" role="status">{q.trim() === "" ? t.picker.noItems : t.list.none}</p>}
        <a className="link-button" href="/chest/catalogue">{t.picker.manage}</a>
      </div>
    </Dialog>
  );
}
