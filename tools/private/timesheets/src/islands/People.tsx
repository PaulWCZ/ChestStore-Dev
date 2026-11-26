import { call, refresh, toast } from "@argentic/chest-app/client";
import { useStep } from "../components/step.ts";
import { Avatar, Confirm, DateField } from "@argentic/chest-ui/components";
import { useEffect, useState } from "react";
import { Close, Pencil } from "../components/icons.tsx";
import { amountProblem, amountText, hoursText, parseAmount, parseHours } from "../shared/amounts.ts";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";
import { rateDayProblem, type RateLock } from "../shared/rate-day.ts";

type Words = { people: Catalogue["people"]; errors: Catalogue["errors"]; date: Catalogue["kit"]["date"] };
export type PersonView = {
  id: string; name: string; photo: string | null;
  // In force today (cents), and their histories in words.
  bill: number | null; cost: number | null; week: number | null;
  billText: string | null; costText: string | null; weekText: string;
  // Where their usual rate applies now (a project's own rate wins), or
  // null without billable time lately.
  useText: string | null;
  // The steps a manager may take back (not in the locked period).
  steps: { kind: "bill" | "cost"; from: string; label: string }[];
};

// Everyone's rates and usual week (src/pages/People.tsx), one row each.
export function PeopleList({ rows, ...rest }: { rows: PersonView[]; today: string; lock: RateLock; companyWeek: number; currency: string; comma: boolean; t: Words }) {
  return <ul className="person-list">{rows.map(p => <PersonRow key={p.id} person={p} {...rest} />)}</ul>;
}

// A person: their rates and usual week; "Change" opens the form, where a
// changed rate applies from a day (today unless said).
function PersonRow({ person, today, lock, companyWeek, currency, comma, t }: { person: PersonView; today: string; lock: RateLock; companyWeek: number; currency: string; comma: boolean; t: Words }) {
  const w = t.people;
  const [pending, start] = useStep();
  const [editing, setEditing] = useState(false);
  const [bill, setBill] = useState(person.bill === null ? "" : amountText(person.bill, comma));
  const [cost, setCost] = useState(person.cost === null ? "" : amountText(person.cost, comma));
  const [week, setWeek] = useState(person.week === null ? "" : hoursText(person.week, comma));
  const [from, setFrom] = useState<string | null>(today);
  const [error, setError] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  // What the day field refuses as typed (unreadable): said under it; Save
  // waits — the day it held before is never sent in its place.
  const [dayProblem, setDayProblem] = useState<string | null>(null);
  const changedRate = (text: string, now: number | null) => (text.trim() === "" ? null : parseAmount(text)) !== now;
  const askDay = changedRate(bill, person.bill) || changedRate(cost, person.cost);
  // The day field leaves when no rate changes: its refusal goes with it.
  useEffect(() => { if (!askDay || !editing) setDayProblem(null); }, [askDay, editing]);

  function save() {
    const b = bill.trim() === "" ? null : parseAmount(bill);
    const c = cost.trim() === "" ? null : parseAmount(cost);
    const h = week.trim() === "" ? null : parseHours(week);
    // What the server would refuse, said here first (an ambiguous amount: how to write it).
    const refused = [bill, cost].map(x => (x.trim() === "" ? null : amountProblem(x))).find(x => x !== null) ?? (week.trim() !== "" && h === null ? "invalid" : null);
    if (refused) return setError(t.errors[refused]);
    // A changed rate needs its first day, after the locked period.
    if ((b !== person.bill || c !== person.cost) && dayProblem) return void document.getElementById(`from-${person.id}`)?.focus();
    const problem = b !== person.bill || c !== person.cost ? rateDayProblem(from, lock, { missing: t.errors.rate_day_missing }) : null;
    setDayError(problem);
    // The day field then says why, and takes the focus (its error is read).
    if (problem) return void document.getElementById(`from-${person.id}`)?.focus();
    setError(null);
    // What changed goes as typed ("80,50", "35:30"): the server reads it
    // again. The page is read once, after the last.
    const quiet = { quiet: true, refresh: false };
    start(async () => {
      try {
        if (b !== person.bill) {
          const r = await call("setRate", { kind: "bill", memberId: person.id, rate: bill, from: from! }, quiet);
          if (!r.ok) return setError(r.message);
        }
        if (c !== person.cost) {
          const r = await call("setRate", { kind: "cost", memberId: person.id, rate: cost, from: from! }, quiet);
          if (!r.ok) return setError(r.message);
        }
        if (h !== person.week) {
          const r = await call("setCapacity", { memberId: person.id, hours: week }, quiet);
          if (!r.ok) return setError(r.message);
        }
        toast({ id: `person-${person.id}`, text: w.saved });
        setEditing(false);
      } finally {
        await refresh();
      }
    });
  }

  function takeBack(step: PersonView["steps"][number]) {
    start(async () => {
      await call("removeRateStep", { kind: step.kind, memberId: person.id, from: step.from });
    });
  }

  return (
    <li className="person" id={`person-${person.id}`}>
      <div className="person-head">
        <Avatar name={person.name} photo={person.photo} />
        <strong className="person-name">{person.name}</strong>
        {!editing && <button type="button" className="button quiet small" onClick={() => setEditing(true)}><Pencil />{w.change}</button>}
      </div>
      {!editing ? (
        <dl className="person-facts">
          <div><dt>{w.bill}</dt><dd>{person.billText ?? <span className="muted">{w.noRate}</span>}{person.bill !== null && person.useText && <span className="small muted block">{person.useText}</span>}</dd></div>
          <div><dt>{w.cost}</dt><dd>{person.costText ?? <span className="muted">{w.noRate}</span>}</dd></div>
          <div><dt>{w.week}</dt><dd>{person.weekText}</dd></div>
        </dl>
      ) : (
        <form className="person-form" onSubmit={e => { e.preventDefault(); save(); }}>
          <div className="form-grid three">
            <div className="field-block">
              <label className="label" htmlFor={`bill-${person.id}`}>{format(w.billLabel, { currency })}</label>
              <input id={`bill-${person.id}`} className="field num" inputMode="decimal" autoComplete="off" value={bill} onChange={e => setBill(e.target.value)} />
              <p className="hint">{person.useText ?? w.billHint}</p>
            </div>
            <div className="field-block">
              <label className="label" htmlFor={`cost-${person.id}`}>{format(w.costLabel, { currency })}</label>
              <input id={`cost-${person.id}`} className="field num" inputMode="decimal" autoComplete="off" value={cost} onChange={e => setCost(e.target.value)} />
              <p className="hint">{w.costHint}</p>
            </div>
            <div className="field-block">
              <label className="label" htmlFor={`week-${person.id}`}>{w.weekLabel}</label>
              <input id={`week-${person.id}`} className="field num" inputMode="decimal" autoComplete="off" value={week} placeholder={hoursText(companyWeek, comma)} onChange={e => setWeek(e.target.value)} />
              <p className="hint">{w.weekHint}</p>
            </div>
          </div>
          {askDay && (
            <div className="field-block">
              <DateField id={`from-${person.id}`} label={w.from} value={from} onChange={d => { setFrom(d); setDayError(null); }} onProblem={setDayProblem} today={today} hint={lock ? `${w.fromHint} ${lock.text}` : w.fromHint} error={dayError} chips={false} labels={t.date} />
            </div>
          )}
          {person.steps.length > 0 && (
            <ul className="task-chips">
              {person.steps.map(s => (
                <li key={s.kind + s.from} className="chip">{s.kind === "bill" ? w.bill : w.cost} · {s.label}
                  <button type="button" className="chip-x" disabled={pending} aria-label={format(w.removeStep, { step: s.label })} title={format(w.removeStep, { step: s.label })} onClick={() => takeBack(s)}><Close /></button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="submit" className="button" disabled={pending || (askDay && dayProblem !== null)}>{w.save}</button>
            <button type="button" className="button link" onClick={() => setEditing(false)}>{w.cancel}</button>
          </div>
        </form>
      )}
    </li>
  );
}

// People who left before the Chest: their name can be forgotten (their
// time stays, anonymous). It cannot be undone: the kit's Confirm asks first.
export function FormerList({ people, t }: { people: { id: string; name: string; hours: string }[]; t: Words }) {
  const [pending, start] = useStep();
  const [asking, setAsking] = useState<{ id: string; name: string } | null>(null);
  function forget(id: string) {
    start(async () => {
      const r = await call("forgetFormer", { id });
      if (!r.ok) return;
      setAsking(null);
      toast({ id: `former-${id}`, text: t.people.forgotten });
    });
  }
  return (
    <>
      <ul className="client-list">
        {people.map(p => (
          <li key={p.id}>
            <span className="client-name">{p.name}</span>
            <span className="muted small num">{p.hours}</span>
            <span className="client-actions">
              <button type="button" className="button link small" onClick={() => setAsking({ id: p.id, name: p.name })}>{t.people.forget}</button>
            </span>
          </li>
        ))}
      </ul>
      <Confirm
        open={asking !== null}
        title={format(t.people.forgetTitle, { name: asking?.name ?? "" })}
        body={t.people.forgetBody}
        confirmLabel={t.people.forgetConfirm}
        cancelLabel={t.people.cancel}
        busy={pending}
        onConfirm={() => { if (asking) forget(asking.id); }}
        onCancel={() => setAsking(null)}
      />
    </>
  );
}
