"use client";

import { DateField, useToast } from "@argentic/chest-ui/components";
import { formatDate, type DateWords } from "@argentic/chest-ui/components/logic";
import { useState, useTransition } from "react";
import { Clock, Cross } from "../../../components/icons.tsx";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { clock, frenchHolidays, halfHours, isDate, maxHolidays, weekdays, type Hours } from "../../../lib/hours.ts";
import { lateChoices } from "../../../lib/model.ts";
import { saveSettings } from "../actions.ts";
import { Box } from "./settings-view.tsx";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"]; dates: DateWords };

// When the team works: a week (each day open or not, from … to …, on the
// half hour, in 24-hour steps: a time field would follow the browser's
// AM/PM), the days off (the kit's DateField, never the browser's), and
// after how long a wait is highlighted.
export function HoursBox({ hours, lateHours, year, today, canSettings, locale, t }: { hours: Hours; lateHours: number; year: number; today: string; canSettings: boolean; locale: string; t: Words }) {
  const s = t.settings;
  const [draft, setDraft] = useState(hours);
  const [day, setDay] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const save = (next: Hours) => start(async () => {
    const r = await saveSettings({ hours: next });
    if (!r.ok) return void toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
    toast({ id: "hours", text: s.saved });
  });
  const setDayHours = (i: number, value: Hours["days"][number]) => setDraft(d => ({ ...d, days: d.days.map((x, j) => (j === i ? value : x)) }));
  const addDays = (days: string[]) => {
    const next = { ...draft, holidays: [...new Set([...draft.holidays, ...days])].sort().slice(-maxHolidays) };
    setDraft(next);
    save(next);
  };
  const removeDay = (date: string) => {
    const next = { ...draft, holidays: draft.holidays.filter(x => x !== date) };
    setDraft(next);
    save(next);
  };
  // Dates in words from the kit's date words (no Intl: the server and the
  // browser write them the same).
  const dateLabel = (date: string) => formatDate(date, t.dates, "long");
  return (
    <Box title={s.hours} icon={<Clock />}>
      <div>
        <label className="label" htmlFor="late">{s.lateLabel}</label>
        <select id="late" className="select medium" defaultValue={lateHours} disabled={!canSettings}
          onChange={e => { const value = Number(e.target.value); start(async () => { const r = await saveSettings({ lateHours: value }); toast(r.ok ? { id: "late", text: s.saved } : { text: format(t.errors[r.error], {}), tone: "error" }); }); }}>
          {lateChoices.map(h => <option key={h} value={h}>{h === 0 ? s.lateNever : plural(s.lateHours, h, locale)}</option>)}
        </select>
        <p className="hint under">{draft.on ? s.lateHintWork : s.lateHint}</p>
      </div>
      <form className="stack" onSubmit={e => { e.preventDefault(); save(draft); }}>
        <fieldset disabled={!canSettings} className="stack bare">
          <label className="switch"><input type="checkbox" checked={draft.on} onChange={e => setDraft(d => ({ ...d, on: e.target.checked }))} />{s.hoursOn}</label>
          <p className="hint">{s.hoursHint}</p>
          {draft.on && (
            <ul className="week">
              {weekdays.map((key, i) => {
                const open = draft.days[i];
                const name = s.days[key];
                return (
                  <li key={key}>
                    <label className="switch day"><input type="checkbox" checked={open !== null} onChange={e => setDayHours(i, e.target.checked ? { start: 540, end: 1080 } : null)} aria-label={format(s.dayOpen, { day: name })} /><span>{name}</span></label>
                    {open && (
                      <span className="row times">
                        <label><span className="visually-hidden">{format(s.fromDay, { day: name })}</span>
                          <select className="select" value={open.start} onChange={e => setDayHours(i, { start: Number(e.target.value), end: Math.max(open.end, Number(e.target.value) + 30) })}>
                            {halfHours.slice(0, -1).map(m => <option key={m} value={m}>{clock(m)}</option>)}
                          </select>
                        </label>
                        <span aria-hidden="true">–</span>
                        <label><span className="visually-hidden">{format(s.toDay, { day: name })}</span>
                          <select className="select" value={open.end} onChange={e => setDayHours(i, { start: open.start, end: Number(e.target.value) })}>
                            {halfHours.filter(m => m > open.start).map(m => <option key={m} value={m}>{clock(m)}</option>)}
                          </select>
                        </label>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canSettings && <div><button type="submit" className="button" disabled={pending}>{s.saveHours}</button></div>}
        </fieldset>
      </form>
      {draft.on && (
        <div className="stack">
          <h3>{s.holidays}</h3>
          {draft.holidays.length === 0 ? <p className="hint">{s.noHolidays}</p> : (
            <ul className="tag-list">
              {draft.holidays.map(d => (
                <li key={d} className="chip tag"><span className="holiday">{dateLabel(d)}</span>{canSettings && <button type="button" className="untag" aria-label={format(s.removeHoliday, { date: dateLabel(d) })} onClick={() => removeDay(d)}><Cross /></button>}</li>
              ))}
            </ul>
          )}
          {canSettings && (
            <div className="row">
              <form className="row add-day" onSubmit={e => { e.preventDefault(); if (day && isDate(day)) { addDays([day]); setDay(null); } }}>
                <DateField id="holiday" label={s.holidayDate} value={day} onChange={setDay} today={today} chips={false} labels={t.dates} />
                <button type="submit" className="button small quiet" disabled={!day || !isDate(day) || pending}>{s.addHoliday}</button>
              </form>
              <button type="button" className="link-button" disabled={pending} onClick={() => addDays(frenchHolidays(year))}>{format(s.addFrance, { year })}</button>
            </div>
          )}
        </div>
      )}
    </Box>
  );
}
