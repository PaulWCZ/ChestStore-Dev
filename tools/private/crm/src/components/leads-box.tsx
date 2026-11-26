import { call, toast } from "@argentic/chest-app/client";
import { Dialog } from "@argentic/chest-ui/components";
import { useId, useOptimistic, useState, useTransition } from "react";
import { format } from "../i18n/format.ts";
import { phoneHref } from "../shared/model.ts";
import { Building, Mail, Person, Phone } from "./icons.tsx";
import { OwnerPicker } from "./owner-select.tsx";
import type { Teammate, Words } from "./shared.ts";
import { StepForm, type StepWords } from "./step-box.tsx";

export type LeadWords = StepWords & Words<"leads" | "timeline" | "dialog">;

export type LeadRow = { id: string; name: string; email: string; phone: string; company: string | null; when: string; form: string; message: string; maybe: { id: string; name: string } | null; booked: string };
type Props = { rows: LeadRow[]; total: number; team: Teammate[]; me: string; canAssign: boolean; today: string; calendar: boolean; t: LeadWords };

// The leads inbox, at the top of My day: the contacts forms made that
// nobody has yet. "I'll take it" makes it mine and asks what comes next;
// "Give to…" hands it to someone; "Not a lead" takes it off the list (Undo).
export function LeadsBox({ rows, total, team, me, canAssign, today, calendar, t }: Props) {
  const [shown, remove] = useOptimistic(rows, (list: LeadRow[], id: string) => list.filter(r => r.id !== id));
  const [asking, setAsking] = useState<LeadRow | null>(null);
  const [giving, setGiving] = useState<LeadRow | null>(null);
  const [, start] = useTransition();
    const w = t.leads;

  function take(row: LeadRow) {
    start(async () => {
      remove(row.id);
      const r = await call("takeLead", { id: row.id });
      if (!r.ok) return;
      setAsking(row);
    });
  }
  function dismiss(row: LeadRow) {
    start(async () => {
      remove(row.id);
      const r = await call("dismissLead", { id: row.id });
      if (!r.ok) return;
      toast({
        id: `lead-${row.id}`,
        text: format(w.notLeadDone, { name: row.name }),
        undo: async () => {
          const back = await call("restoreLead", { id: row.id }, { quiet: true });
          return back.ok ? true : back.message;
        },
      });
    });
  }

  if (shown.length === 0 && !asking) return null;
  return (
    <section className="leads" aria-labelledby="leads-title">
      {asking && (
        <section className="step-box editing" aria-labelledby="lead-ask-title">
          <h2 id="lead-ask-title" className="label-mono">{t.step.whatNext}</h2>
          <p className="ask-on"><a href={`/chest/contacts/${asking.id}`}>{asking.name}</a>{asking.company ? ` · ${asking.company}` : ""}</p>
          <StepForm key={asking.id} initial={null} on={{ contact: asking.id }} team={team} me={me} canAssign={canAssign} today={today} calendar={calendar} onDone={() => setAsking(null)} onSkip={() => setAsking(null)} t={t} />
        </section>
      )}
      {shown.length > 0 && (
        <>
          <div className="panel-head">
            <h2 id="leads-title" className="label-mono">{w.title} <span className="count num">{total - (rows.length - shown.length)}</span></h2>
            {rows.length < total ? <a className="link-button" href="/chest/contacts?owner=none">{format(w.more, { count: total })}</a> : null}
          </div>
          <p className="muted small-text">{w.lede}</p>
          <ul className="lead-list">
            {shown.map(row => (
              <li key={row.id} className="lead-row">
                <div className="lead-main">
                  <p className="lead-name">
                    <Person />
                    <a href={`/chest/contacts/${row.id}`}>{row.name}</a>
                    {row.company && <span className="muted"><Building />{row.company}</span>}
                    <span className="muted lead-when">{row.when}</span>
                  </p>
                  <p className="lead-reach">
                    {row.email && <a href={`mailto:${row.email}`}><Mail />{row.email}</a>}
                    {row.phone && <a className="num" href={phoneHref(row.phone)}><Phone />{row.phone}</a>}
                  </p>
                  {row.form && <p className="small-text muted">{format(t.timeline.form, { form: row.form })}</p>}
                  {row.booked && <p className="small-text muted">{row.booked}</p>}
                  {row.message && <p className="lead-message">{row.message}</p>}
                  {row.maybe && <p className="notice warn lead-maybe"><a href={`/chest/contacts/${row.id}`}>{format(w.maybe, { name: row.maybe.name })}</a></p>}
                </div>
                <div className="lead-actions">
                  <button type="button" className="button small" onClick={() => take(row)} aria-label={format(w.takeLabel, { name: row.name })}>{w.take}</button>
                  {canAssign && <button type="button" className="button small quiet" onClick={() => setGiving(row)}>{w.give}</button>}
                  <button type="button" className="button small quiet" onClick={() => dismiss(row)} aria-label={format(w.notLeadLabel, { name: row.name })}>{w.notLead}</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {giving && <GiveDialog row={giving} team={team} me={me} onClose={() => setGiving(null)} t={t} />}
    </section>
  );
}

// "Give to…": the kit's people picker, then Give.
function GiveDialog({ row, team, me, onClose, t }: { row: LeadRow; team: Teammate[]; me: string; onClose: () => void; t: LeadWords }) {
  const [to, setTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formId = useId();
    const w = t.leads;
  return (
    <Dialog open title={format(w.giveTitle, { name: row.name })} onClose={onClose} dirty={to !== null} labels={t.dialog}
      footer={<>
        <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        <button type="submit" form={formId} className="button" disabled={pending || !to}>{w.giveConfirm}</button>
      </>}>
      <form id={formId} className="form" onSubmit={e => {
        e.preventDefault();
        if (!to) return;
        setError(null);
        start(async () => {
          const r = await call("takeLead", { id: row.id, to }, { quiet: true });
          if (!r.ok) return setError(r.message);
          toast(format(w.given, { name: row.name, to: team.find(p => p.id === to)?.name ?? "" }));
          onClose();
        });
      }}>
        <OwnerPicker id="lead-give" label={w.giveWho} value={to} team={team} me={me} canAssign allowNobody={false} hint={false} onChange={setTo} t={t} />
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
