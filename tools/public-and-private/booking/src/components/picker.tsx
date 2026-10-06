import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { call, send } from "@argentic/chest-app/client";
import type { ErrorCode } from "@argentic/chest-app";
import { clock as clockIn, dayWords, firstUpper, format } from "../i18n/format.ts";
import type { Catalogue } from "../i18n/index.ts";
import { questionLimits, type Question } from "../shared/kinds.ts";
import { addDays, isZone, wall, weekdayOf } from "../shared/zone.ts";
import type { ZoneGroup } from "../shared/zones.ts";
import { Alert, Back, Check, Clock, Globe, Next } from "./icons.tsx";
import { ZoneSelect } from "./zone-select.tsx";

// Picking a time, in the islands that need one (src/islands/BookTime.tsx,
// MoveMine.tsx, MoveMeeting.tsx, ForGuest.tsx): a component, not an island
// of its own — its `chosen` is a function.
export type PickerWords = { public: Catalogue["public"]; days: Catalogue["days"]; errors: Catalogue["errors"]; answers: Catalogue["answers"] };

type Props = {
  hostName: string;
  hostZone: string;
  // The first date (host's calendar) with a free time; null: nothing soon.
  first: string | null;
  locale: string;
  // The time zones offered, written by the server.
  zones: ZoneGroup[];
  t: PickerWords;
  // A visitor booking a type of a host's page.
  hostSlug?: string;
  typeSlug?: string;
  phone?: boolean;
  company?: string;
  started?: string;
  // The host's own questions on the form.
  questions?: Question[];
  // Whether the Chest would email the confirmation now (mail.available):
  // otherwise the email field promises none.
  mailing?: boolean;
  // Moving a booking: the guest's secret instead of the form.
  move?: { secret: string; zone: string };
  // The team's pages: where the free times come from (…?type=3), and what
  // to show once a time is chosen.
  source?: string;
  chosen?: (start: string, when: string, zone: string, reset: () => void) => ReactNode;
};

// Five weeks at a time, from the week of the first free day: the end of a
// month never hides the next one.
const span = 35;
const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

// Picking a time: the coming weeks with the days that have free times, the
// day's times in the visitor's time zone (they can change it), then the few
// fields of the booking — or, when moving a booking, one button.
export function Picker({ hostSlug = "", typeSlug = "", hostName, hostZone, first, locale, zones, phone = false, company = "", started = "", questions = [], mailing = true, t, move, source, chosen }: Props) {
  const p = t.public;
  const [zone, setZone] = useState(move?.zone ?? hostZone);
  useEffect(() => {
    if (move || source) return;
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isZone(mine)) setZone(mine);
  }, [move, source]);
  const today = wall(Date.now(), zone).date;
  const firstWeek = mondayOf(today);
  const [from, setFrom] = useState(mondayOf(first ?? wall(Date.now(), hostZone).date));
  const [slots, setSlots] = useState<Record<string, string[] | "loading" | "failed">>({});
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const asked = useRef(new Set<string>());
  const load = useCallback(async (start: string, force = false) => {
    if (!force && asked.current.has(start)) return;
    asked.current.add(start);
    setSlots(s => ({ ...s, [start]: "loading" }));
    try {
      const range = `from=${addDays(start, -1)}&to=${addDays(start, span)}`;
      const url = source ? `${source}&${range}` : `/api/slots?host=${encodeURIComponent(hostSlug)}&type=${encodeURIComponent(typeSlug)}&${range}`;
      const response = await fetch(url, { cache: "no-store" });
      const answer = (await response.json()) as { slots?: string[] };
      setSlots(s => ({ ...s, [start]: answer.slots ?? [] }));
    } catch {
      asked.current.delete(start);
      setSlots(s => ({ ...s, [start]: "failed" }));
    }
  }, [hostSlug, typeSlug, source]);
  useEffect(() => { void load(from); }, [from, load]);

  const last = addDays(from, span - 1);
  // The weeks' free times, by the visitor's day.
  const byDay = useMemo(() => {
    const found = new Map<string, string[]>();
    const list = slots[from];
    if (!Array.isArray(list)) return found;
    for (const start of list) {
      const d = wall(Date.parse(start), zone).date;
      if (d < from || d > last) continue;
      found.set(d, [...(found.get(d) ?? []), start]);
    }
    return found;
  }, [slots, from, last, zone]);

  // Open on the first day with times, once they are known.
  useEffect(() => {
    if (day && day >= from && day <= last) return;
    const firstOpen = [...byDay.keys()].sort()[0];
    if (firstOpen) setDay(firstOpen);
  }, [byDay, day, from, last]);

  const monthWords = (d: string, options: Intl.DateTimeFormatOptions) => dayWords(d, locale, options);
  const heading = firstUpper(from.slice(0, 7) === last.slice(0, 7)
    ? monthWords(from, { month: "long", year: "numeric" })
    : from.slice(0, 4) === last.slice(0, 4) ? `${monthWords(from, { month: "long" })} – ${monthWords(last, { month: "long", year: "numeric" })}` : `${monthWords(from, { month: "long", year: "numeric" })} – ${monthWords(last, { month: "long", year: "numeric" })}`, locale);
  const cells = Array.from({ length: span }, (_, i) => addDays(from, i));
  const weeks = Array.from({ length: span / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const shortDays = [1, 2, 3, 4, 5, 6, 0].map(i => t.days.short[i] ?? "");
  const longDays = [1, 2, 3, 4, 5, 6, 0].map(i => t.days.long[i] ?? "");
  const clock = (start: string) => clockIn(start, zone, locale);
  const dayLabel = (d: string) => monthWords(d, { weekday: "long", day: "numeric", month: "long" });
  const state = slots[from];
  const times = day ? byDay.get(day) ?? [] : [];
  // The month grid is one Tab stop: the chosen day (or the first open one)
  // takes the focus, the arrows move among the open days (left, right; up
  // and down a week; Home, End), Enter or Space picks — the grid pattern.
  const grid = useRef<HTMLTableElement>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const openDays = cells.filter(d => byDay.has(d));
  const roving = cursor && byDay.has(cursor) ? cursor : day && byDay.has(day) ? day : openDays[0] ?? null;
  function moveInGrid(e: KeyboardEvent) {
    if (!roving) return;
    const at = cells.indexOf(roving);
    const find = (step: number) => {
      for (let j = at + step; j >= 0 && j < cells.length; j += step) if (byDay.has(cells[j]!)) return cells[j]!;
      return null;
    };
    const target = e.key === "ArrowRight" ? find(1) : e.key === "ArrowLeft" ? find(-1) : e.key === "ArrowDown" ? find(7) ?? find(1) : e.key === "ArrowUp" ? find(-7) ?? find(-1) : e.key === "Home" ? openDays[0] ?? null : e.key === "End" ? openDays.at(-1) ?? null : undefined;
    if (target === undefined) return;
    e.preventDefault();
    if (!target) return;
    setCursor(target);
    grid.current?.querySelector<HTMLButtonElement>(`button[data-day="${target}"]`)?.focus();
  }
  const noneHere = Array.isArray(state) && byDay.size === 0;
  const retake = useCallback((code: ErrorCode | null) => {
    if (code === "taken") {
      setTime(null);
      setNotice(p.taken);
      void load(from, true);
    }
  }, [load, from, p.taken]);

  // What the right column shows: loading, a failure, nothing free, or the
  // chosen day's times.
  function timesPane() {
    if (state === "loading" || state === undefined) return <p className="loading">{p.loading}</p>;
    if (state === "failed") return <p className="error"><Alert />{t.errors.unavailable}</p>;
    if (noneHere) return <p className="muted">{first === null ? p.nothingSoon : p.noTimes}</p>;
    if (!day) return <p className="muted">{p.pickDay}</p>;
    return (
      <>
        <h3>{firstUpper(dayLabel(day), locale)}</h3>
        {times.length === 0 ? <p className="muted">{p.noTimes}</p> : times.map(start => (
          <button key={start} type="button" className="time-button" aria-pressed={start === time} onClick={() => { setTime(start); setNotice(null); }}>{clock(start)}</button>
        ))}
      </>
    );
  }

  const when = time ? `${dayLabel(wall(Date.parse(time), zone).date)}, ${clock(time)}` : "";
  const shift = (n: number) => { setFrom(addDays(from, n * span)); setTime(null); };
  return (
    <div className="stack">
      {!time || move || chosen ? (
        <div className="picker">
          <div>
            <div className="month-head">
              <button type="button" className="icon-button" aria-label={p.previousMonth} disabled={from <= firstWeek} onClick={() => shift(-1)}><Back /></button>
              <strong aria-live="polite">{heading}</strong>
              <button type="button" className="icon-button" aria-label={p.nextMonth} onClick={() => shift(1)}><Next /></button>
            </div>
            <table className="calendar" role="grid" aria-label={p.pickDay} ref={grid} onKeyDown={moveInGrid}>
              <thead><tr>{shortDays.map((d, i) => <th key={i} scope="col" abbr={longDays[i]}>{d}</th>)}</tr></thead>
              <tbody>
                {weeks.map((week, w) => (
                  <tr key={w}>
                    {week.map(d => {
                      const open = byDay.has(d);
                      const newMonth = d.endsWith("-01");
                      return (
                        <td key={d}>
                          <button type="button" className={`${open ? "open" : ""}${d === today ? " today" : ""}${d < today ? " past" : ""}`} disabled={!open} aria-pressed={d === day} aria-label={dayLabel(d)} data-day={d} tabIndex={d === roving ? 0 : -1} onClick={() => { setDay(d); setCursor(d); setTime(null); setNotice(null); }}>
                            {newMonth ? <span className="month-start">{monthWords(d, { month: "short" })}</span> : null}
                            {Number(d.slice(8))}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="zone">
              <Globe />
              <label htmlFor="zone">{p.timesIn}</label>
              <ZoneSelect id="zone" value={zone} groups={zones} onChange={z => { setZone(z); setTime(null); }} />
            </div>
          </div>
          <div className="times" aria-live="polite">
            {timesPane()}
          </div>
        </div>
      ) : null}
      {notice && <p className="error" role="alert"><Alert />{notice}</p>}
      {time && chosen && chosen(time, when, zone, () => { setTime(null); void load(from, true); })}
      {time && !move && !chosen && <GuestForm hostSlug={hostSlug} typeSlug={typeSlug} start={time} zone={zone} when={when} hostName={hostName} phone={phone} company={company} started={started} questions={questions} mailing={mailing} t={t} onChange={() => setTime(null)} onError={retake} />}
      {time && move && <MoveButton secret={move.secret} start={time} when={when} t={t} onError={retake} />}
    </div>
  );
}

// The time chosen, as a big mint tag.
export const When = ({ when }: { when: string }) => <span className="tag free when"><Clock />{when}</span>;

// The guest's few fields and the host's questions, sent to the public
// action bookTime (src/actions.ts) as the form's fields; once booked, the
// guest's page opens (the action answers its address). What was typed
// stays when a refusal comes back.
function GuestForm({ hostSlug, typeSlug, start, zone, when, hostName, phone, company, started, questions, mailing, t, onChange, onError }: {
  hostSlug: string; typeSlug: string; start: string; zone: string; when: string; hostName: string; phone: boolean; company: string; started: string; questions: Question[]; mailing: boolean; t: PickerWords; onChange: () => void; onError: (code: ErrorCode | null) => void;
}) {
  const p = t.public;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const r = await send<null>("/actions/bookTime", {}, new FormData(event.currentTarget), { quiet: true, refresh: false });
    setPending(false);
    if (r.ok) return;
    onError(r.error);
    setError(r.error === "taken" ? null : r.message);
  }
  return (
    <form method="post" action="/actions/bookTime" className="stack guest-form" onSubmit={e => void submit(e)}>
      <p className="chosen">
        <When when={when} />
        {" "}<button type="button" className="link-button" onClick={onChange}>{p.change}</button>
      </p>
      <h2>{p.you}</h2>
      <input type="hidden" name="host" value={hostSlug} />
      <input type="hidden" name="type" value={typeSlug} />
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="zone" value={zone} />
      <input type="hidden" name="started" value={started} />
      <div className="honey" aria-hidden="true"><label htmlFor="website">{p.website}</label><input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
      <div><label className="label" htmlFor="name">{p.name}</label><input id="name" name="name" className="field" autoComplete="name" maxLength={120} required autoFocus /></div>
      <div><label className="label" htmlFor="email">{p.email}</label><input id="email" name="email" type="email" className="field" autoComplete="email" maxLength={254} required aria-describedby="email-hint" /><p id="email-hint" className="hint">{mailing ? p.emailHint : p.emailHintNoMail}</p></div>
      {phone && <div><label className="label" htmlFor="phone">{p.phone}</label><input id="phone" name="phone" type="tel" className="field" autoComplete="tel" maxLength={40} required aria-describedby="phone-hint" /><p id="phone-hint" className="hint">{format(p.phoneHint, { name: hostName })}</p></div>}
      {questions.map(q => <Ask key={q.id} q={q} t={t} />)}
      <div><label className="label" htmlFor="note">{p.note}</label><textarea id="note" name="note" className="field" rows={3} maxLength={2000} /></div>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div><button type="submit" className="button wide" disabled={pending}><Check />{pending ? p.confirming : p.confirm}</button></div>
      <p className="hint">{company ? format(p.privacy, { company }) : p.privacyPlain}</p>
    </form>
  );
}

// One of the host's questions: a line, a box, one choice among options, or
// yes/no. Optional ones say so; the server checks the answers again.
function Ask({ q, t }: { q: Question; t: PickerWords }) {
  const name = `q_${q.id}`;
  const label = q.required ? q.label : format(t.public.optional, { label: q.label });
  if (q.kind === "short") return <div><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} className="field" maxLength={questionLimits.short} required={q.required} /></div>;
  if (q.kind === "long") return <div><label className="label" htmlFor={name}>{label}</label><textarea id={name} name={name} className="field" rows={3} maxLength={questionLimits.long} required={q.required} /></div>;
  const options = q.kind === "choice" ? q.options.map(o => ({ value: o, text: o })) : [{ value: "yes", text: t.answers.yes }, { value: "no", text: t.answers.no }];
  return (
    <fieldset className="stack-s bare">
      <legend className="label">{label}</legend>
      <div className={q.kind === "choice" ? "choices" : "pills"}>
        {options.map(o => <label key={o.value} className="choice"><input type="radio" name={name} value={o.value} required={q.required} /><span>{o.text}</span></label>)}
      </div>
    </fieldset>
  );
}

// Moving one's booking: the time chosen, one button; the guest's page then
// says it moved (the action answers its address).
function MoveButton({ secret, start, when, t, onError }: { secret: string; start: string; when: string; t: PickerWords; onError: (code: ErrorCode | null) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack-s">
      <p><When when={when} /></p>
      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div>
        <button type="button" className="button" disabled={pending} onClick={async () => {
          setPending(true);
          const r = await call("moveMine", { secret, start }, { quiet: true, refresh: false });
          setPending(false);
          if (r.ok) return;
          onError(r.error);
          if (r.error !== "taken") setError(r.message);
        }}><Check />{t.public.move}</button>
      </div>
    </div>
  );
}
