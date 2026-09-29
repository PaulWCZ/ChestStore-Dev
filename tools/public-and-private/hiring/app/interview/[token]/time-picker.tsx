"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import { chooseInterviewTime } from "../../public-actions.ts";

type Words = { legend: string; confirm: string; confirming: string; choose: string; more: string; errors: Record<ErrorCode, string> };

// The free times, a group of radio buttons per day (the arrows move within
// a day); the chosen one is said on the one button that confirms it. On a
// phone, the first three days show, then "More days" (app/globals.css):
// a short list rather than eighty buttons.
const firstDays = 3;
export function TimePicker({ token, days, zoneNote, t }: { token: string; days: { day: string; label: string; times: string[] }[]; zoneNote: string; t: Words }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<{ day: string; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [pending, start] = useTransition();
  const label = chosen ? `${days.find(d => d.day === chosen.day)?.label ?? ""}, ${chosen.time}` : "";
  return (
    <form className="stack pick-form" aria-label={t.legend} onSubmit={e => {
      e.preventDefault();
      if (!chosen) return setError(t.choose);
      setError(null);
      start(async () => {
        const r = await chooseInterviewTime(token, chosen.day, chosen.time);
        if (!r.ok) {
          setError(t.errors[r.error] ?? t.errors.unknown);
          // Taken meanwhile: the times are read again.
          if (r.error === "taken") setChosen(null);
        }
        router.refresh();
      });
    }}>
      <p className="hint">{zoneNote}</p>
      {days.map((d, i) => (
        <fieldset key={d.day} className={`pick-day${i >= firstDays && !all ? " later" : ""}`}>
          <legend className="label">{d.label}</legend>
          <div className="pick-times">
            {d.times.map(time => {
              const on = chosen?.day === d.day && chosen.time === time;
              return (
                <label key={time} className={`pick-time${on ? " on" : ""}`}>
                  <input type="radio" name="time" value={`${d.day} ${time}`} checked={on} onChange={() => { setChosen({ day: d.day, time }); setError(null); }} />
                  <span>{time}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {days.length > firstDays && !all && <button type="button" className="button quiet pick-more" onClick={() => setAll(true)}>{t.more}</button>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="pick-confirm">
        <button type="submit" className="button" disabled={pending || !chosen}>{pending ? t.confirming : chosen ? format(t.confirm, { when: label }) : t.choose}</button>
      </div>
    </form>
  );
}
