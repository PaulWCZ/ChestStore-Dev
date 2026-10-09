import { call, navigate, toast } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import { useLayoutEffect, useState, useTransition } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";
import { limits } from "../shared/model.ts";
import { useDateProblems, WatchedDateField } from "../components/date-problems.tsx";
import { Wrench } from "../components/icons.tsx";

type Words = { claim: Catalogue["claim"]; repair: Catalogue["repair"]; common: Catalogue["common"]; dialog: Catalogue["dialog"]; date: Catalogue["date"] };

// "Claim the warranty" on a problem reported while the item is under
// warranty: what the supplier will ask for (the end of the warranty, where
// and when it was bought, the invoice), then the item goes to repair with
// the claim in its history — the repairer's ticket and the day expected
// back, as for any repair. The problem stays open until it comes back.
export function ClaimButton({ item, problem, facts, holderName, today, t }: {
  item: { id: string; name: string };
  problem: string;
  // Already in words: "Under warranty until 23 October 2026", "Apple Store
  // Business", "5 October 2023"; the invoice's address when there is one.
  facts: { warranty: string; supplier: string | null; bought: string | null; invoice: string | null };
  holderName: string | null;
  today: string;
  t: Words;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const first = format(t.claim.note, { problem: problem.replace(/\s+/gu, " ").trim() }).slice(0, limits.condition);
  const [note, setNote] = useState(first);
  const [ref, setRef] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dates = useDateProblems();
  useLayoutEffect(() => setDirty(note !== first || ref.trim() !== ""), [note, ref, first]);
  const w = t.claim;
  return (
    <>
      <button type="button" className="button small" onClick={() => { setError(null); setOpen(true); }}><Wrench />{w.button}</button>
      <Dialog open={open} title={format(w.title, { name: item.name })} labels={t.dialog} dirty={dirty} onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={e => {
          e.preventDefault();
          if (dates.problem) return;
          setError(null);
          start(async () => {
            const r = await call("setItemStatus", { id: item.id, status: "in_repair", note, ref, due: due ?? "" }, { quiet: true });
            if (!r.ok) return setError(r.message);
            setOpen(false);
            toast(format(w.done, { name: item.name }));
          });
        }}>
          <dl className="facts">
            <div><dt>{w.warranty}</dt><dd>{facts.warranty}</dd></div>
            <div><dt>{w.supplier}</dt><dd>{facts.supplier ?? t.common.none}</dd></div>
            <div><dt>{w.bought}</dt><dd>{facts.bought ?? t.common.none}</dd></div>
            <div><dt>{w.invoice}</dt><dd>{facts.invoice ? <a href={facts.invoice} target="_blank" rel="noopener">{w.openInvoice}</a> : w.noInvoice}</dd></div>
          </dl>
          {holderName && <p className="hint">{format(w.held, { name: holderName })}</p>}
          <div className="form-field">
            <label className="label" htmlFor={`claim-ref-${item.id}`}>{w.ref} <span className="muted">({t.common.optional})</span></label>
            <input id={`claim-ref-${item.id}`} className="field mono" value={ref} onChange={e => setRef(e.target.value)} maxLength={limits.ref} placeholder={t.repair.refPlaceholder} autoComplete="off" />
          </div>
          <WatchedDateField label={`${t.repair.due} (${t.common.optional})`} value={due} onChange={setDue} onProblem={dates.watch("due")} today={today} min={today} labels={t.date} />
          <div className="form-field">
            <label className="label" htmlFor={`claim-note-${item.id}`}>{w.noteLabel}</label>
            <textarea id={`claim-note-${item.id}`} className="field" rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={limits.condition} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row end">
            <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.common.cancel}</button>
            <button type="submit" className="button" disabled={pending || dates.problem !== null}><Wrench />{w.submit}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
