"use client";

import { Dialog, useToast } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useId, useOptimistic, useState, useTransition } from "react";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { phoneHref } from "../../../../lib/model.ts";
import { markFormLine, moveFormLine, pickContacts } from "../../actions.ts";
import { Combobox } from "../../ui/combobox.tsx";
import type { Choice } from "../../ui/shared.ts";

type Who = { name: string; email: string; phone: string; company: string };
export type CheckRow = { id: string; when: string; form: string; body: string; who: Who | null; why: "email" | "before"; contact: { id: string; name: string; email: string; phone: string }; link: string | null };

// Each answer to check: what the form gave beside the contact it was filed
// on, the answer in Forms, and the two ways out.
export function CheckList({ rows, t }: { rows: CheckRow[]; t: Catalogue }) {
  const [shown, remove] = useOptimistic(rows, (list: CheckRow[], id: string) => list.filter(r => r.id !== id));
  const [moving, setMoving] = useState<CheckRow | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const w = t.check;
  function right(row: CheckRow) {
    start(async () => {
      remove(row.id);
      const r = await markFormLine(row.id, true);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
      toast({ id: `check-${row.id}`, text: format(w.rightDone, { name: row.contact.name }), undo: async () => {
        const back = await markFormLine(row.id, false);
        return back.ok ? true : format(t.errors[back.error], back.values);
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
            <p className="small-text"><span className="muted">{w.filedOn} </span><Link prefetch={false} href={`/chest/contacts/${row.contact.id}`}>{row.contact.name}</Link>{row.contact.email ? <span className="muted"> · {row.contact.email}</span> : null}{row.contact.phone ? <span className="muted num"> · {row.contact.phone}</span> : null}</p>
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
function MoveDialog({ row, onClose, t }: { row: CheckRow; onClose: () => void; t: Catalogue }) {
  const [to, setTo] = useState<Choice | null>(null);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formId = useId();
  const toast = useToast();
  const w = t.check;
  const canNew = row.who !== null && (row.who.name !== "" || row.who.email !== "" || row.who.phone !== "");
  const search = async (q: string) => {
    const r = await pickContacts(q, null);
    return r.ok ? r.value.filter(x => x.id !== row.contact.id) : [];
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
          const r = await moveFormLine(row.id, target);
          if (!r.ok) return setError(format(t.errors[r.error], r.values));
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
