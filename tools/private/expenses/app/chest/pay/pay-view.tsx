"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { DateBox, Stamp, Thumb } from "../../../components/bits.tsx";
import { Check, Wallet } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import type { RowView } from "../../../lib/rows.ts";
import { markPaid, unmarkPaid } from "../actions.ts";

export type PayGroup = { owner: string; name: string; photo: string | null; total: string; summary: string; rows: RowView[] };

export function PayView({ groups, recent, today, t }: { groups: PayGroup[]; recent: RowView[]; today: string; t: Pick<Catalogue, "pay" | "errors"> }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Record<string, string>>({});

  function pay(g: PayGroup) {
    const ids = g.rows.map(r => r.id);
    setGone(set => new Set([...set, g.owner]));
    start(async () => {
      const result = await markPaid(ids, dates[g.owner] ?? today);
      if (!result.ok) {
        setGone(set => new Set([...set].filter(o => o !== g.owner)));
        return toast(format(t.errors[result.error], result.values ?? {}));
      }
      toast(format(t.pay.marked, { total: g.total, name: g.name }), {
        label: t.pay.undo,
        run: () => void unmarkPaid(ids).then(r => {
          if (r.ok) {
            setGone(set => new Set([...set].filter(o => o !== g.owner)));
            toast(t.pay.unpaid);
          }
          router.refresh();
        }),
      });
      router.refresh();
    });
  }

  const shown = groups.filter(g => !gone.has(g.owner));
  return (
    <>
      {shown.length === 0 && (
        <div className="paper empty">
          <span className="glyph"><Wallet /></span>
          <h2>{t.pay.empty.title}</h2>
          <p>{t.pay.empty.body}</p>
        </div>
      )}
      {shown.map(g => (
        <section key={g.owner} className="paper" aria-label={g.name}>
          <div className="person-head">
            <Avatar name={g.name} photo={g.photo} size={36} />
            <div className="grow">
              <div className="name">{g.name}</div>
              <div className="hint">{g.summary}</div>
            </div>
          </div>
          <hr className="rule" />
          <ul className="rows">
            {g.rows.map(r => (
              <li key={r.id} className="row">
                <Thumb row={r} />
                <a className="main" href={r.href}><span className="what">{r.what}</span><span className="sub"><span className="mono">{r.day} {r.month}</span>{r.sub && <span>{r.sub}</span>}</span></a>
                <span className="right"><span className="amount">{r.amount}</span></span>
              </li>
            ))}
          </ul>
          <hr className="rule" />
          <div className="total-line"><span className="label">{t.pay.totalLabel}</span><span className="amount">{g.total}</span></div>
          <form className="pay-form" style={{ marginTop: 12 }} onSubmit={e => { e.preventDefault(); pay(g); }}>
            <div className="field-row">
              <label htmlFor={`paid-${g.owner}`}>{t.pay.paidOn}</label>
              <input id={`paid-${g.owner}`} type="date" className="field mono" max={today} value={dates[g.owner] ?? today} onChange={e => setDates(d => ({ ...d, [g.owner]: e.target.value }))} />
            </div>
            <button type="submit" className="button" disabled={pending}><Check />{t.pay.markPaid}</button>
          </form>
        </section>
      ))}
      {recent.length > 0 && (
        <section className="section" aria-label={t.pay.recent}>
          <h2><span>{t.pay.recent}</span></h2>
          <ul className="rows">
            {recent.map(r => (
              <li key={r.id} className="row">
                <DateBox row={r} />
                <a className="main" href={r.href}><span className="what">{r.what}</span><span className="sub">{r.sub}</span></a>
                <span className="right"><span className="amount">{r.amount}</span><Stamp row={r} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
