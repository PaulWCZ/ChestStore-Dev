"use client";

import { Avatar, Dialog, EmptyState, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DateBox, ReceiptThumb, RowStamp, Warnings } from "../../../components/bits.tsx";
import { Check, Close, Stamp as StampIcon } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { RowView } from "../../../lib/rows.ts";
import { decideExpenses } from "../actions.ts";

export type PersonGroup = { owner: string; name: string; photo: string | null; summary: string; sent: string; left: boolean; rows: RowView[] };
type Words = Pick<Catalogue, "approve" | "detail" | "form" | "errors" | "dialog"> & { companyCard: string };

// What "Approve all" may approve at once: the lines without a warning.
const clean = (g: PersonGroup) => g.rows.filter(r => r.warnings.length === 0);

export function ApproveView({ groups, recent, locale, t }: { groups: PersonGroup[]; recent: RowView[]; locale: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [lightbox, setLightbox] = useState<RowView | null>(null);

  function decide(ids: string[], verdict: "approve" | "refuse", why?: string) {
    setGone(set => new Set([...set, ...ids]));
    start(async () => {
      const result = await decideExpenses(ids, verdict, why);
      if (!result.ok) {
        setGone(set => new Set([...set].filter(id => !ids.includes(id))));
        return void toast({ text: format(t.errors[result.error], result.values ?? {}), tone: "error" });
      }
      // The owners have been told (the bell): no Undo.
      toast({ id: `decide-${ids.join("-")}`, text: verdict === "approve" ? plural(t.approve.approved, result.value.count, locale) : format(t.approve.refused, { name: result.value.owner }), sent: true });
      setRefusing(null);
      setReason("");
      router.refresh();
    });
  }

  const shown = groups.map(g => ({ ...g, rows: g.rows.filter(r => !gone.has(r.id)) })).filter(g => g.rows.length > 0);
  return (
    <>
      {shown.length === 0 && (
        <div className="paper">
          <EmptyState icon={<StampIcon />} title={t.approve.empty.title} body={t.approve.empty.body} />
        </div>
      )}
      {shown.map(g => (
        <section key={g.owner} className="paper" aria-label={g.name}>
          <div className="person-head">
            <Avatar name={g.name} photo={g.photo} size="m" />
            <div className="grow">
              <div className="name">{g.name}</div>
              <div className="hint">{g.summary}{g.sent ? " · " + format(t.approve.sentOn, { when: g.sent }) : ""}</div>
            </div>
            {/* "Approve all" approves what has no warning; a warned line
                (a refusal sent again, no receipt, a duplicate…) gets a look
                and a decision of its own. */}
            {g.rows.length > 1 && clean(g).length > 0 && (
              <button type="button" className="button" disabled={pending} onClick={() => decide(clean(g).map(r => r.id), "approve")}>
                <Check />{clean(g).length === g.rows.length ? plural(t.approve.approveAll, g.rows.length, locale) : plural(t.approve.approveClean, clean(g).length, locale)}
              </button>
            )}
          </div>
          {g.rows.length > 1 && clean(g).length < g.rows.length && <p className="hint">{plural(t.approve.lookFirst, g.rows.length - clean(g).length, locale)}</p>}
          {g.left && <p className="notice left">{t.approve.left}</p>}
          <hr className="rule" />
          <ul className="rows">
            {g.rows.map(r => (
              <li key={r.id} className={`row decision${r.warnings.length > 0 ? " warned" : ""}`}>
                <ReceiptThumb row={r} label={format(t.approve.openReceipt, { what: r.what })} onPreview={() => setLightbox(r)} />
                <a className="main" href={r.href}>
                  <span className="what">{r.what}</span>
                  <span className="sub"><span className="mono">{r.day} {r.month}</span>{r.sub && <span>{r.sub}</span>}{r.card && <span>{t.companyCard}</span>}<Warnings list={r.warnings} /></span>
                </a>
                <span className="right">
                  <span className="amount">{r.amount}</span>
                  <span className="decide">
                    <button type="button" className="button small" disabled={pending} onClick={() => decide([r.id], "approve")} aria-label={`${t.approve.approveOne}: ${r.what}, ${r.amount}`}><Check />{t.approve.approveOne}</button>
                    <button type="button" className="button small danger" disabled={pending} onClick={() => { setRefusing(r.id); setReason(""); }} aria-label={`${t.approve.refuse}: ${r.what}, ${r.amount}`}><Close /><span className="refuse-word">{t.approve.refuse}</span></button>
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
      {/* The receipt, large: the kit's dialog (Escape, the close button or the
          backdrop close it — nothing typed here to lose). */}
      <Dialog open={lightbox !== null} title={lightbox ? format(t.approve.openReceipt, { what: lightbox.what }) : ""} onClose={() => setLightbox(null)} labels={t.dialog} size="l">
        {lightbox?.preview && <img className="lightbox" src={lightbox.preview} alt={format(t.approve.openReceipt, { what: lightbox.what })} />}
        {lightbox?.open && <a className="button quiet small lightbox-open" href={lightbox.open} target="_blank" rel="noopener">{t.detail.openFull}</a>}
      </Dialog>
      {recent.length > 0 && (
        <section className="section" aria-label={t.approve.recent}>
          <h2><span>{t.approve.recent}</span></h2>
          <ul className="rows">
            {recent.map(r => (
              <li key={r.id} className="row">
                <DateBox row={r} />
                <a className="main" href={r.href}><span className="what">{r.what}</span><span className="sub">{r.sub}</span></a>
                <span className="right"><span className="amount">{r.amount}</span><RowStamp row={r} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
