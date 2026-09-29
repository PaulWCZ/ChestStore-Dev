"use client";

import { Dialog, EmptyState, SearchBox, useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ItemLine, StatusStamp } from "../../../../components/bits.tsx";
import { CategoryIcon, Give, Print, TakeBack } from "../../../../components/icons.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import type { Result } from "../../../../lib/errors.ts";
import { fold, limits } from "../../../../lib/model.ts";
import type { Row } from "../../../../lib/view.ts";
import { giveBackEverything, giveItem, giveSeat, takeBackItem, takeEverythingBack, takeSeat, undoTakeBack, undoTakeSeat } from "../../actions.ts";

type Words = { person: Catalogue["person"]; errors: Catalogue["errors"]; common: Catalogue["common"]; give: Catalogue["give"]; takeBack: Catalogue["takeBack"]; item: Catalogue["item"]; list: Catalogue["list"]; dialog: Catalogue["dialog"]; search: Catalogue["search"] };

// A person's equipment as a checklist: take one thing back, or everything
// at once (Undo gives it all back); give them something from the stock.
export function PersonView({ holder, name, present, gone, items, seats, offer, count, leaving = null, receipt = {}, sheets = null, t, locale }: {
  holder: string; name: string; present: boolean; gone: boolean; items: Row[]; seats: Row[]; offer: Row[]; count: number;
  // "Last day: Monday 12 October…", when People told Equipment they leave.
  leaving?: string | null;
  // Per item held: did they confirm receiving it?
  receipt?: Record<string, "confirmed" | "waiting">;
  // Their handover and return sheets.
  sheets?: { handover: string; back: string } | null;
  t: Words; locale: string;
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
  const fault = (r: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => format(t.errors[r.error], r.values);
  const err = (r: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => void toast({ text: fault(r), tone: "error" });
  // An Undo that tells the truth: true when it worked, else why not.
  const undoing = (step: () => Promise<Result>) => async () => {
    const u = await step();
    router.refresh();
    return u.ok || fault(u);
  };

  function takeAll() {
    start(async () => {
      const r = await takeEverythingBack(holder);
      if (!r.ok) return err(r);
      const taken = r.value;
      toast({ id: `take-all-${holder}`, text: plural(t.person.takenAll, taken.items.length + taken.seats.length, locale), undo: undoing(() => giveBackEverything(holder, taken)) });
      router.refresh();
    });
  }
  function takeOne(row: Row) {
    start(async () => {
      if (row.holder.kind === "seats") {
        const r = await takeSeat(row.id, holder);
        if (!r.ok) return err(r);
        toast({ id: `seat-${row.id}-${holder}`, text: t.takeBack.seatDone, ...(holder.startsWith("mbr_") ? { undo: undoing(() => undoTakeSeat(row.id, holder)) } : {}) });
      } else {
        const r = await takeBackItem(row.id, {});
        if (!r.ok) return err(r);
        const from = r.value;
        toast({ id: `back-${row.id}`, text: format(t.takeBack.done, { name: row.name }), undo: undoing(() => undoTakeBack(row.id, from)) });
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
      {receipt[row.id] && <StatusStamp status={receipt[row.id] === "confirmed" ? "received" : "confirm"} text={receipt[row.id] === "confirmed" ? t.person.confirmed : t.person.toConfirm} />}
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
        {present && <button type="button" className={count > 0 ? "button quiet" : "button"} onClick={() => { setError(null); setQ(""); setGiving(true); }}><Give />{t.person.give}</button>}
        {sheets && count > 0 && <Link className="button quiet" href={sheets.handover}><Print />{t.person.handover}</Link>}
        {sheets && <Link className="button quiet" href={sheets.back}><Print />{t.person.returnSheet}</Link>}
      </div>
      {count === 0 && <EmptyState title={t.person.empty} />}
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
      <Dialog open={giving} title={format(t.person.giveTitle, { name })} labels={t.dialog} onClose={() => setGiving(false)}>
        <div className="stack">
          <SearchBox action="/chest/items" onSearch={setQ} shortcut={false} maxLength={limits.search} labels={{ ...t.search, label: t.person.findItem, placeholder: t.person.findItem }} />
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
