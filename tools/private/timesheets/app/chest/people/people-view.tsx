"use client";

import { Avatar, Confirm, DateField, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Close, Pencil } from "../../../components/icons.tsx";
import { amountText, hoursText, parseAmount, parseHours } from "../../../lib/amounts.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { forgetFormer, removeRateStep, setCapacity, setRate } from "../actions.ts";

type Words = { people: Catalogue["people"]; errors: Catalogue["errors"]; date: Catalogue["date"] };
export type PersonView = {
  id: string; name: string; photo: string | null;
  // In force today (cents), and their histories in words.
  bill: number | null; cost: number | null; week: number | null;
  billText: string | null; costText: string | null; weekText: string;
  // The steps a manager may take back (not in the locked period).
  steps: { kind: "bill" | "cost"; from: string; label: string }[];
};

// A person: their rates and usual week; "Change" opens the form, where a
// changed rate applies from a day (today unless said).
export function PersonRow({ person, today, lockedUntil, companyWeek, currency, comma, t }: { person: PersonView; today: string; lockedUntil: string | null; companyWeek: number; currency: string; comma: boolean; t: Words }) {
  const w = t.people;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [bill, setBill] = useState(person.bill === null ? "" : amountText(person.bill, comma));
  const [cost, setCost] = useState(person.cost === null ? "" : amountText(person.cost, comma));
  const [week, setWeek] = useState(person.week === null ? "" : hoursText(person.week, comma));
  const [from, setFrom] = useState<string | null>(today);
  const [error, setError] = useState<string | null>(null);
  const changedRate = (text: string, now: number | null) => (text.trim() === "" ? null : parseAmount(text)) !== now;

  function save() {
    const b = bill.trim() === "" ? null : parseAmount(bill);
    const c = cost.trim() === "" ? null : parseAmount(cost);
    const h = week.trim() === "" ? null : parseHours(week);
    if ((bill.trim() !== "" && b === null) || (cost.trim() !== "" && c === null) || (week.trim() !== "" && h === null)) return setError(t.errors.invalid);
    setError(null);
    start(async () => {
      if (b !== person.bill) {
        const r = await setRate({ kind: "bill", memberId: person.id, cents: b, from: from ?? today });
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
      }
      if (c !== person.cost) {
        const r = await setRate({ kind: "cost", memberId: person.id, cents: c, from: from ?? today });
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
      }
      if (h !== person.week) {
        const r = await setCapacity(person.id, h);
        if (!r.ok) return setError(format(t.errors[r.error], r.values));
      }
      toast({ id: `person-${person.id}`, text: w.saved });
      setEditing(false);
      router.refresh();
    });
  }

  function takeBack(step: PersonView["steps"][number]) {
    start(async () => {
      const r = await removeRateStep({ kind: step.kind, memberId: person.id, from: step.from });
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
      router.refresh();
    });
  }

  return (
    <li className="person">
      <div className="person-head">
        <Avatar name={person.name} photo={person.photo} />
        <strong className="person-name">{person.name}</strong>
        {!editing && <button type="button" className="button quiet small" onClick={() => setEditing(true)}><Pencil />{w.change}</button>}
      </div>
      {!editing ? (
        <dl className="person-facts">
          <div><dt>{w.bill}</dt><dd>{person.billText ?? <span className="muted">{w.noRate}</span>}</dd></div>
          <div><dt>{w.cost}</dt><dd>{person.costText ?? <span className="muted">{w.noRate}</span>}</dd></div>
          <div><dt>{w.week}</dt><dd>{person.weekText}</dd></div>
        </dl>
      ) : (
        <form className="person-form" onSubmit={e => { e.preventDefault(); save(); }}>
          <div className="form-grid three">
            <div className="field-block">
              <label className="label" htmlFor={`bill-${person.id}`}>{format(w.billLabel, { currency })}</label>
              <input id={`bill-${person.id}`} className="field num" inputMode="decimal" autoComplete="off" value={bill} onChange={e => setBill(e.target.value)} />
              <p className="hint">{w.billHint}</p>
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
          {(changedRate(bill, person.bill) || changedRate(cost, person.cost)) && (
            <div className="field-block from">
              <DateField id={`from-${person.id}`} label={w.from} value={from} onChange={setFrom} today={today} min={lockedUntil} hint={w.fromHint} chips={false} labels={t.date} />
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
            <button type="submit" className="button" disabled={pending}>{w.save}</button>
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
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<{ id: string; name: string } | null>(null);
  function forget(id: string) {
    start(async () => {
      const r = await forgetFormer(id);
      if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
      setAsking(null);
      toast({ id: `former-${id}`, text: t.people.forgotten });
      router.refresh();
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
