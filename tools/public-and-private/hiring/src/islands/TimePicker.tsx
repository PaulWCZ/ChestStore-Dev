import { Honeypot, send } from "@argentic/chest-app/client";
import { useState, type FormEvent } from "react";
import { format } from "../shared/format.ts";

type Words = { legend: string; confirm: string; confirming: string; choose: string; more: string };

// The free times, a group of radio buttons per day (the arrows move within
// a day); the chosen one is said on the one button that confirms it. On a
// phone, the first three days show, then "More days": a short list rather
// than eighty buttons. Sent in place; without JavaScript the same form
// posts. A time taken meanwhile is said, and the page shows what is left.
const firstDays = 3;
export function TimePicker({ token, days, zoneNote, t }: { token: string; days: { day: string; label: string; times: string[] }[]; zoneNote: string; t: Words }) {
  const [chosen, setChosen] = useState<{ day: string; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [pending, setPending] = useState(false);
  const folded = !all && days.length - firstDays > 0;
  const label = chosen ? `${days.find(d => d.day === chosen.day)?.label ?? ""}, ${chosen.time}` : "";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen) return setError(t.choose);
    setError(null);
    setPending(true);
    const outcome = await send<null>("/actions/chooseTime", {}, new FormData(event.currentTarget), { quiet: true });
    setPending(false);
    if (!outcome.ok) {
      setError(outcome.message);
      // Taken meanwhile: the times are read again (the refresh), the choice cleared.
      if (outcome.error === "taken") setChosen(null);
    }
  }
  return (
    <form className="stack pick-form" aria-label={t.legend} method="post" action="/actions/chooseTime" onSubmit={event => void submit(event)}>
      <Honeypot />
      <input type="hidden" name="token" value={token} />
      <p className="hint">{zoneNote}</p>
      {days.map((d, i) => (
        <fieldset key={d.day} className={`pick-day${i >= firstDays && !all ? " later" : ""}`}>
          <legend className="label">{d.label}</legend>
          <div className="pick-times">
            {d.times.map(time => {
              const on = chosen?.day === d.day && chosen.time === time;
              return (
                <label key={time} className={`pick-time${on ? " on" : ""}`}>
                  <input type="radio" name="slot" value={`${d.day} ${time}`} checked={on} onChange={() => { setChosen({ day: d.day, time }); setError(null); }} />
                  <span>{time}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      {folded && <button type="button" className="button quiet pick-more" onClick={() => setAll(true)}>{t.more}</button>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="pick-confirm">
        <button type="submit" className="button" disabled={pending}>{pending ? t.confirming : chosen ? format(t.confirm, { when: label }) : t.choose}</button>
      </div>
    </form>
  );
}
