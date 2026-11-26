import { call, toast } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import { useId, useOptimistic, useState, useTransition } from "react";
import { format } from "../i18n/format.ts";
import { phoneHref } from "../shared/model.ts";
import { Combobox } from "./combobox.tsx";
import { searchContacts } from "./pickers.tsx";
import type { Choice, Words } from "./shared.ts";

export type CheckWords = Words<"check" | "timeline" | "common" | "deal" | "dialog">;

type Who = { name: string; email: string; phone: string; company: string };
export type CheckRow = { id: string; when: string; form: string; body: string; who: Who | null; why: "email" | "before"; contact: { id: string; name: string; email: string; phone: string }; link: string | null };

// Each answer to check: what the form gave beside the contact it was filed
// on, the answer in Forms, and the two ways out.
export function CheckList({ rows, t }: { rows: CheckRow[]; t: CheckWords }) {
  const [shown, remove] = useOptimistic(rows, (list: CheckRow[], id: string) => list.filter(r => r.id !== id));
  const [moving, setMoving] = useState<CheckRow | null>(null);
  const [, start] = useTransition();
    const w = t.check;
  function right(row: CheckRow) {
    start(async () => {
      remove(row.id);
      const r = await call("markFormLine", { id: row.id, checked: true });
      if (!r.ok) return;
      toast({ id: `check-${row.id}`, text: format(w.rightDone, { name: row.contact.name }), undo: async () => {
        const back = await call("markFormLine", { id: row.id, checked: false }, { quiet: true });
        return back.ok ? true : back.message;
      } });
    });
  }
  if (shown.length === 0) return <p className="muted">{w.empty}</p>;
  return (
    <>
      <ul className="check-list">
        {shown.map(row => (
          <li key={row.id} className="check-row">
            <p className="event-head"><strong>{format(t.timeline.form, { form: row.form })}</strong><time>{row.when}</time></p>
            <p className="small-text">{row.why === "email" ? w.whyEmail : w.whyBefore}</p>
            {row.who && <Identity label={t.timeline.formGave} who={row.who} />}
            <p className="small-text"><span className="muted">{w.filedOn} </span><a href={`/chest/contacts/${row.contact.id}`}>{row.contact.name}</a>{row.contact.email ? <span className="muted"> · {row.contact.email}</span> : null}{row.contact.phone ? <span className="muted num"> · {row.contact.phone}</span> : null}</p>
            {row.body && <p className="event-body">{row.body}</p>}
            <div className="row">
              {row.link && <a className="button small quiet" href={row.link} target="_blank" rel="noopener">{w.open}</a>}
              <button type="button" className="button small" onClick={() => right(row)}>{w.right}</button>
              <button type="button" className="button small quiet" onClick={() => setMoving(row)}>{w.move}</button>
            </div>
          </li>
        ))}
      </ul>
      {moving && <MoveDialog row={moving} onClose={() => setMoving(null)} t={t} />}
    </>
  );
}

function Identity({ label, who }: { label: string; who: Who }) {
  return (
    <p className="event-who">
      <span className="muted">{label}</span>
      {who.name && <span>{who.name}</span>}
      {who.email && <a href={`mailto:${who.email}`}>{who.email}</a>}
      {who.phone && <a className="num" href={phoneHref(who.phone)}>{who.phone}</a>}
      {who.company && <span>{who.company}</span>}
    </p>
  );
}

// Move: to a new contact made from what the form gave (when it gave
// something), or to a contact of the book.
function MoveDialog({ row, onClose, t }: { row: CheckRow; onClose: () => void; t: CheckWords }) {
  const [to, setTo] = useState<Choice | null>(null);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formId = useId();
    const w = t.check;
  const canNew = row.who !== null && (row.who.name !== "" || row.who.email !== "" || row.who.phone !== "");
  const search = async (q: string) => {
    return (await searchContacts(q, null)).filter(x => x.id !== row.contact.id);
  };
  return (
    <Dialog open title={w.moveTitle} onClose={onClose} dirty={to !== null || fresh} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        <button type="submit" form={formId} className="button" disabled={pending || (!fresh && !to)}>{w.moveConfirm}</button>
      </>}>
      <form id={formId} className="form" onSubmit={e => {
        e.preventDefault();
        const target = fresh ? "new" : to?.id;
        if (!target) return;
        setError(null);
        start(async () => {
          const r = await call("moveFormLine", { id: row.id, to: target }, { quiet: true });
          if (!r.ok) return setError(r.message);
          toast(w.moved);
          onClose();
        });
      }}>
        <fieldset className="field-block">
          <legend className="label">{w.moveTo}</legend>
          {canNew && (
            <label className="check-line">
              <input type="checkbox" checked={fresh} onChange={e => setFresh(e.currentTarget.checked)} />
              <span>{w.moveNew}{row.who?.name ? ` (${row.who.name})` : ""}</span>
            </label>
          )}
          {!fresh && (
            <div className="field-block">
              <label className="label" htmlFor="move-to">{canNew ? w.moveOr : t.deal.searchContact}</label>
              <Combobox id="move-to" value={to} onChange={setTo} search={search} placeholder={t.deal.searchContact} clearLabel={t.common.cancel} noMatch={t.deal.noMatch} />
            </div>
          )}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
