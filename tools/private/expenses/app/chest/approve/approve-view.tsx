"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { DateBox, Stamp, Thumb, Warnings } from "../../../components/bits.tsx";
import { Check, Close, Stamp as StampIcon } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { RowView } from "../../../lib/rows.ts";
import { decideExpenses } from "../actions.ts";

export type PersonGroup = { owner: string; name: string; photo: string | null; summary: string; sent: string; self: boolean; rows: RowView[] };
type Words = Pick<Catalogue, "approve" | "detail" | "form" | "errors"> & { companyCard: string };

export function ApproveView({ groups, recent, locale, t }: { groups: PersonGroup[]; recent: RowView[]; locale: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function decide(ids: string[], verdict: "approve" | "refuse", why?: string) {
    setGone(set => new Set([...set, ...ids]));
    start(async () => {
      const result = await decideExpenses(ids, verdict, why);
      if (!result.ok) {
        setGone(set => new Set([...set].filter(id => !ids.includes(id))));
        return toast(format(t.errors[result.error], result.values ?? {}));
      }
      toast(verdict === "approve" ? plural(t.approve.approved, result.value.count, locale) : format(t.approve.refused, { name: result.value.owner }));
      setRefusing(null);
      setReason("");
      router.refresh();
    });
  }

  const shown = groups.map(g => ({ ...g, rows: g.rows.filter(r => !gone.has(r.id)) })).filter(g => g.rows.length > 0);
  return (
    <>
      {shown.length === 0 && (
        <div className="paper empty">
          <span className="glyph"><StampIcon /></span>
          <h2>{t.approve.empty.title}</h2>
          <p>{t.approve.empty.body}</p>
        </div>
      )}
      {shown.map(g => (
        <section key={g.owner} className="paper" aria-label={g.name}>
          <div className="person-head">
            <Avatar name={g.name} photo={g.photo} size={36} />
            <div className="grow">
              <div className="name">{g.name}</div>
              <div className="hint">{g.summary}{g.sent ? " · " + format(t.approve.sentOn, { when: g.sent }) : ""}</div>
            </div>
            {g.rows.length > 1 && (
              <button type="button" className="button" disabled={pending} onClick={() => decide(g.rows.map(r => r.id), "approve")}>
                <Check />{plural(t.approve.approveAll, g.rows.length, locale)}
              </button>
            )}
          </div>
          {g.self && <p className="notice info" style={{ marginTop: 12 }}>{t.approve.self}</p>}
          <hr className="rule" />
          <ul className="rows">
            {g.rows.map(r => (
              <li key={r.id} className="row decision">
                <Thumb row={r} />
                <a className="main" href={r.href}>
                  <span className="what">{r.what}</span>
                  <span className="sub"><span className="mono">{r.day} {r.month}</span>{r.sub && <span>{r.sub}</span>}{r.card && <span>{t.companyCard}</span>}<Warnings list={r.warnings} /></span>
                </a>
                <span className="right">
                  <span className="amount">{r.amount}</span>
                  <span className="decide">
                    <button type="button" className="button small" disabled={pending} onClick={() => decide([r.id], "approve")} aria-label={`${t.approve.approveOne}: ${r.what}, ${r.amount}`}><Check />{t.approve.approveOne}</button>
                    <button type="button" className="button small danger" disabled={pending} onClick={() => { setRefusing(r.id); setReason(""); }} aria-label={`${t.approve.refuse}: ${r.what}, ${r.amount}`}><Close /><span className="visually-hidden">{t.approve.refuse}</span></button>
                  </span>
                </span>
                {refusing === r.id && (
                  <form className="inline-refuse" onSubmit={e => { e.preventDefault(); decide([r.id], "refuse", reason); }}>
                    <label htmlFor={`reason-${r.id}`} className="visually-hidden">{t.detail.reason}</label>
                    <input id={`reason-${r.id}`} className="field" value={reason} onChange={e => setReason(e.target.value)} placeholder={t.detail.reason} maxLength={500} autoFocus />
                    <button type="submit" className="button danger small" disabled={pending || reason.trim() === ""}>{t.detail.confirmRefuse}</button>
                    <button type="button" className="button quiet small" onClick={() => setRefusing(null)}>{t.form.cancel}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {recent.length > 0 && (
        <section className="section" aria-label={t.approve.recent}>
          <h2><span>{t.approve.recent}</span></h2>
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
