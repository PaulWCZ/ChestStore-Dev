"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Lock } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { hoursText, parseHours } from "../../../lib/amounts.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, formatDay } from "../../../lib/i18n/format.ts";
import { lockUntil, saveReminder } from "../actions.ts";

type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"] };

// The locked period and the Friday reminder.
export function SettingsView(props: {
  today: string; lockedUntil: string | null; lockText: string | null; lastMonth: { day: string; label: string; done: boolean };
  reminder: { enabled: boolean; minutes: number }; comma: boolean; locale: string; t: Words;
}) {
  const { t } = props;
  const w = t.settings;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [until, setUntil] = useState(props.lockedUntil ?? props.lastMonth.day);
  const [enabled, setEnabled] = useState(props.reminder.enabled);
  const [threshold, setThreshold] = useState(hoursText(props.reminder.minutes, props.comma));
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => toast(format(t.errors[code], values));

  function lock(day: string | null) {
    start(async () => {
      const r = await lockUntil(day);
      if (!r.ok) return fail(r.error, r.values);
      toast(day ? format(w.lock.locked, { date: formatDay(day, props.locale, { day: "numeric", month: "long", year: "numeric" }) }) : w.lock.unlocked);
      router.refresh();
    });
  }
  function reminder(next: { enabled: boolean; text: string }) {
    const minutes = parseHours(next.text);
    if (!minutes) return fail("invalid");
    start(async () => {
      const r = await saveReminder({ enabled: next.enabled, minutes });
      if (!r.ok) return fail(r.error, r.values);
      toast(w.reminder.saved);
    });
  }

  return (
    <>
      <section className="panel" aria-labelledby="lock-title">
        <h2 id="lock-title"><Lock />{w.lock.title}</h2>
        <p>{w.lock.body}</p>
        <p className={props.lockText ? "notice" : "muted"}>{props.lockText ?? w.lock.none}</p>
        {!props.lastMonth.done && <p><button type="button" className="button" disabled={pending} onClick={() => lock(props.lastMonth.day)}>{props.lastMonth.label}</button></p>}
        <form className="inline-form" onSubmit={e => { e.preventDefault(); lock(until); }}>
          <label className="label" htmlFor="lock-until">{w.lock.until}</label>
          <input id="lock-until" type="date" className="field short" value={until} max={props.today} onChange={e => setUntil(e.target.value)} />
          <button type="submit" className="button quiet" disabled={pending || !until}>{w.lock.submit}</button>
        </form>
        {props.lockedUntil && <p><button type="button" className="button link" disabled={pending} onClick={() => lock(null)}>{w.lock.unlock}</button></p>}
      </section>
      <section className="panel" aria-labelledby="reminder-title">
        <h2 id="reminder-title">{w.reminder.title}</h2>
        <p>{w.reminder.body}</p>
        <label className="check">
          <input type="checkbox" checked={enabled} disabled={pending} onChange={e => { setEnabled(e.target.checked); reminder({ enabled: e.target.checked, text: threshold }); }} />
          <span>{w.reminder.enabled}</span>
        </label>
        <form className="inline-form" onSubmit={e => { e.preventDefault(); reminder({ enabled, text: threshold }); }}>
          <label className="label" htmlFor="threshold">{w.reminder.threshold}</label>
          <input id="threshold" className="field num tiny" inputMode="decimal" value={threshold} disabled={!enabled} onChange={e => setThreshold(e.target.value)} onBlur={() => reminder({ enabled, text: threshold })} />
          <span>{w.reminder.unit}</span>
        </form>
        <p className="hint">{w.reminder.later}</p>
      </section>
    </>
  );
}
