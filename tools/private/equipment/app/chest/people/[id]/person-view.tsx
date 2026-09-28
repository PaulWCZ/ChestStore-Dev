"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ItemLine } from "../../../../components/bits.tsx";
import { Dialog } from "../../../../components/dialog.tsx";
import { CategoryIcon, Give, Search, TakeBack } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import { fold } from "../../../../lib/model.ts";
import type { Row } from "../../../../lib/view.ts";
import { giveBackEverything, giveItem, giveSeat, takeBackItem, takeEverythingBack, takeSeat, undoTakeBack, undoTakeSeat } from "../../actions.ts";

type Words = { person: Catalogue["person"]; errors: Catalogue["errors"]; common: Catalogue["common"]; give: Catalogue["give"]; takeBack: Catalogue["takeBack"]; item: Catalogue["item"]; list: Catalogue["list"] };

// A person's equipment as a checklist: take one thing back, or everything
// at once (Undo gives it all back); give them something from the stock.
export function PersonView({ holder, name, present, gone, items, seats, offer, count, leaving = null, t, locale }: {
  holder: string; name: string; present: boolean; gone: boolean; items: Row[]; seats: Row[]; offer: Row[]; count: number;
  // "Last day: Monday 12 October…", when People told Equipment they leave.
  leaving?: string | null; t: Words; locale: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [giving, setGiving] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const shown = useMemo(() => {
    const k = fold(q);
    return offer.filter(o => !k || fold(`${o.name} ${o.tag} ${o.category} ${o.serial ?? ""}`).includes(k)).slice(0, 60);
  }, [offer, q]);
  const err = (r: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => toast(format(t.errors[r.error], r.values));

  function takeAll() {
    start(async () => {
      const r = await takeEverythingBack(holder);
      if (!r.ok) return err(r);
      const taken = r.value;
      toast(plural(t.person.takenAll, taken.items.length + taken.seats.length, locale), { label: t.common.undo, run: () => void giveBackEverything(holder, taken).then(() => router.refresh()) });
      router.refresh();
    });
  }
  function takeOne(row: Row) {
    start(async () => {
      if (row.holder.kind === "seats") {
        const r = await takeSeat(row.id, holder);
        if (!r.ok) return err(r);
        toast(t.takeBack.seatDone, holder.startsWith("mbr_") ? { label: t.common.undo, run: () => void undoTakeSeat(row.id, holder).then(() => router.refresh()) } : undefined);
      } else {
        const r = await takeBackItem(row.id, {});
        if (!r.ok) return err(r);
        const from = r.value;
        toast(format(t.takeBack.done, { name: row.name }), { label: t.common.undo, run: () => void undoTakeBack(row.id, from).then(() => router.refresh()) });
      }
      router.refresh();
    });
  }
  function give(row: Row) {
    setError(null);
    start(async () => {
      const r = row.holder.kind === "seats" ? await giveSeat(row.id, holder) : await giveItem(row.id, { to: { member: holder } });
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      setGiving(false);
      toast(row.holder.kind === "seats" ? format(t.give.seatDone, { name }) : format(t.give.done, { name }));
      router.refresh();
    });
  }

  const back = (row: Row) => (
    <span className="line-act">
      <button type="button" className="button small quiet" disabled={pending} onClick={() => takeOne(row)}>
        <TakeBack /><span aria-hidden="true">{t.item.takeBack}</span><span className="visually-hidden">{format(t.takeBack.title, { name: row.name })}</span>
      </button>
    </span>
  );

  return (
    <div className="stack">
      {gone && count > 0 && <p className="notice warn">{holder === "erased" ? t.person.erased : t.person.left}</p>}
      {!gone && leaving && count > 0 && <p className="notice warn">{leaving}</p>}
      <div className="row">
        {count > 0 && <button type="button" className="button" disabled={pending} onClick={takeAll}><TakeBack />{t.person.takeAll}</button>}
        {present && <button type="button" className={count > 0 ? "button quiet" : "button"} onClick={() => { setError(null); setGiving(true); }}><Give />{t.person.give}</button>}
      </div>
      {count === 0 && <div className="empty"><p>{t.person.empty}</p></div>}
      {items.length > 0 && (
        <section aria-labelledby="held">
          <h2 id="held" className="section-title">{t.person.items}</h2>
          <ul className="lines checklist">{items.map(r => <ItemLine key={r.id} row={r} extra={back(r)} />)}</ul>
        </section>
      )}
      {seats.length > 0 && (
        <section aria-labelledby="seats">
          <h2 id="seats" className="section-title">{t.person.licences}</h2>
          <ul className="lines checklist">{seats.map(r => <ItemLine key={r.id} row={r} extra={back(r)} />)}</ul>
        </section>
      )}
      <Dialog open={giving} title={format(t.person.giveTitle, { name })} closeLabel={t.common.close} onClose={() => setGiving(false)}>
        <div className="stack">
          <div className="search-field">
            <Search />
            <label className="visually-hidden" htmlFor="offer-q">{t.person.findItem}</label>
            <input id="offer-q" className="field" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.person.findItem} autoFocus autoComplete="off" />
          </div>
          {shown.length === 0 ? <p className="muted">{t.person.noStock}</p> : (
            <ul className="pick-list">
              {shown.map(o => (
                <li key={o.id}>
                  <button type="button" className="pick" disabled={pending} onClick={() => give(o)}>
                    <span className="pick-icon" aria-hidden="true"><CategoryIcon name={o.icon} /></span>
                    <span className="pick-text"><span>{o.name}</span><span className="small muted"><span className="mono">{o.tag}</span> · {o.holder.kind === "seats" ? o.holderText : o.category}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </Dialog>
    </div>
  );
}
