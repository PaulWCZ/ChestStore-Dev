"use client";

import { DateField, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Close, Plus } from "../../../components/icons.tsx";
import { parseAmount } from "../../../lib/amounts.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { removeRateStep, setRate } from "../actions.ts";
import { rateDayProblem, type RateLock } from "../../../components/rate-day.ts";

type Words = { project: Catalogue["project"]; errors: Catalogue["errors"]; date: Catalogue["date"] };
export type PersonRate = { memberId: string; name: string; steps: { from: string; label: string; removable: boolean }[] };

// Rates of some people on this project (a senior billed more than the
// project's rate): each from a day, like every rate.
export function PersonRates({ projectId, rates, people, hasTime, today, origin, lock, currency, t }: {
  projectId: string; rates: PersonRate[]; people: { id: string; name: string }[]; hasTime: boolean; today: string; origin: string; lock: RateLock; currency: string; t: Words;
}) {
  const w = t.project;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [who, setWho] = useState("");
  const [rate, setRateText] = useState("");
  const [from, setFrom] = useState<string | null>(today);
  // What the day field refuses as typed (unreadable): said under it; Add
  // waits — the day it held before is never sent in its place.
  const [fromProblem, setFromProblem] = useState<string | null>(null);
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => void toast({ text: format(t.errors[code], values), tone: "error" });

  function add() {
    const cents = rate.trim() === "" ? null : parseAmount(rate);
    if (!who || (rate.trim() !== "" && cents === null)) return fail("invalid");
    if (hasTime && fromProblem) return void document.getElementById("pr-from")?.focus();
    const problem = hasTime ? rateDayProblem(from, lock, { missing: t.errors.rate_day_missing }) : null;
    if (problem) return void toast({ text: problem, tone: "error" });
    start(async () => {
      const r = await setRate({ kind: "bill", projectId, memberId: who, cents, from: hasTime ? from! : origin });
      if (!r.ok) return fail(r.error, r.values);
      setWho("");
      setRateText("");
      toast({ id: "person-rate", text: w.saved });
      router.refresh();
    });
  }
  function takeBack(memberId: string, stepFrom: string) {
    start(async () => {
      const r = await removeRateStep({ kind: "bill", projectId, memberId, from: stepFrom });
      if (!r.ok) return fail(r.error, r.values);
      router.refresh();
    });
  }

  return (
    <section className="tasks-editor" aria-labelledby="person-rates-title">
      <h2 id="person-rates-title" className="label">{w.personRates}</h2>
      <p className="hint">{w.personRatesHint}</p>
      {rates.length > 0 && (
        <ul className="client-list">
          {rates.map(r => (
            <li key={r.memberId}>
              <span className="client-name">{r.name}</span>
              <ul className="task-chips">
                {r.steps.map(s => (
                  <li key={s.from} className="chip">{s.label}
                    {s.removable && <button type="button" className="chip-x" disabled={pending} aria-label={format(w.removeRate, { step: s.label, name: r.name })} title={format(w.removeRate, { step: s.label, name: r.name })} onClick={() => takeBack(r.memberId, s.from)}><Close /></button>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={e => { e.preventDefault(); add(); }}>
        <label className="visually-hidden" htmlFor="pr-who">{w.personRatePerson}</label>
        <select id="pr-who" className="field" value={who} onChange={e => setWho(e.target.value)}>
          <option value="">{w.personRatePerson}</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="visually-hidden" htmlFor="pr-rate">{format(w.rate, { currency })}</label>
        <input id="pr-rate" className="field num short" inputMode="decimal" autoComplete="off" placeholder={format(w.rate, { currency })} value={rate} onChange={e => setRateText(e.target.value)} />
        {hasTime && <DateField id="pr-from" label={w.personRateFrom} value={from} onChange={setFrom} onProblem={setFromProblem} today={today} hint={lock?.text} chips={false} labels={t.date} />}
        <button type="submit" className="button quiet" disabled={pending || !who || (hasTime && fromProblem !== null)}><Plus />{w.personRateAdd}</button>
      </form>
    </section>
  );
}
