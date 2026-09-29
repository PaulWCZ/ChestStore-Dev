"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "../../../components/avatar.tsx";
import { BankForm } from "../../../components/bank-form.tsx";
import { DateBox, Stamp, Thumb, Warnings } from "../../../components/bits.tsx";
import { Dialog } from "../../../components/dialog.tsx";
import { Alert, Check, Download, FileIcon, Wallet } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { formatMoney } from "../../../lib/money.ts";
import type { RowView } from "../../../lib/rows.ts";
import { cancelTransferFile, makeTransferFile, markPaid, unmarkPaid } from "../actions.ts";

type Bank = { masked: string; bic: string | null; holder: string; since: string; sepa: boolean; changed: string | null };
export type PayGroup = { owner: string; name: string; photo: string | null; total: string; summary: string; rows: RowView[]; bank: Bank | null };
type FileLine = { id: string; title: string; sub: string; cancelled: boolean };
type Words = { pay: Catalogue["pay"]; errors: Catalogue["errors"]; bank: Catalogue["settings"]["bank"]; cancel: string; close: string };

// Saves the batch's file, as a download of the page itself.
function download(id: string) {
  const a = document.createElement("a");
  a.href = `/chest/pay/files/${id}`;
  a.download = "";
  document.body.append(a);
  a.click();
  a.remove();
}

export function PayView({ groups, ready, preview, files, recent, today, locale, t }: {
  groups: PayGroup[];
  ready: "ready" | "sepa_currency" | "no_company_bank";
  preview: { count: number; label: string } | null;
  files: FileLine[];
  recent: RowView[];
  today: string;
  locale: string;
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Record<string, string>>({});
  const [execution, setExecution] = useState(today);
  const [editing, setEditing] = useState<PayGroup | null>(null);

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

  function makeFile() {
    start(async () => {
      const result = await makeTransferFile(execution);
      if (!result.ok) return void toast(format(t.errors[result.error], result.values ?? {}));
      const { id, count, total, skipped } = result.value;
      const amount = formatMoney(total, "EUR", locale);
      toast([plural(t.pay.made, count, locale, { total: amount }), skipped > 0 ? plural(t.pay.skipped, skipped, locale) : ""].filter(Boolean).join(" "), {
        label: t.pay.undo,
        run: () => void cancelTransferFile(id).then(r => {
          toast(r.ok ? t.pay.cancelled : format(t.errors[r.error], r.values ?? {}));
          router.refresh();
        }),
      });
      download(id);
      router.refresh();
    });
  }

  function cancelFile(id: string) {
    start(async () => {
      const result = await cancelTransferFile(id);
      toast(result.ok ? t.pay.cancelled : format(t.errors[result.error], result.values ?? {}));
      router.refresh();
    });
  }

  const shown = groups.filter(g => !gone.has(g.owner));
  return (
    <>
      {shown.length > 0 && (
        <section className="paper flat by-file" aria-labelledby="by-file">
          <h2 id="by-file" style={{ display: "flex", gap: 8, alignItems: "center" }}><FileIcon />{t.pay.byFile}</h2>
          {ready === "ready" && preview && (
            <>
              <p className="hint">{t.pay.byFileBody}</p>
              <form className="pay-form" onSubmit={e => { e.preventDefault(); makeFile(); }}>
                <div className="field-row">
                  <label htmlFor="execution">{t.pay.execution}</label>
                  <input id="execution" type="date" className="field mono" min={today} value={execution} onChange={e => setExecution(e.target.value)} />
                </div>
                <button type="submit" className="button" disabled={pending}><Download />{preview.label}</button>
              </form>
            </>
          )}
          {ready === "ready" && !preview && <p className="hint">{t.errors.no_bank_details}</p>}
          {ready === "no_company_bank" && <p className="hint">{t.pay.notReadyBank} <a href="/chest/settings/company#bank">{t.pay.notReadyBankLink}</a></p>}
          {ready === "sepa_currency" && <p className="hint">{t.pay.notReadyCurrency}</p>}
        </section>
      )}
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
          <div className="bank-line">
            {g.bank
              ? <span className="mono">{format(t.bank.current, { masked: g.bank.masked })}{!g.bank.sepa && <span className="warn"><Alert />{t.pay.notSepa}</span>}</span>
              : <span className="hint">{t.pay.noBank}</span>}
            {g.bank?.changed && <span className="warn"><Alert />{g.bank.changed}</span>}
            <button type="button" className="link-button" onClick={() => setEditing(g)}>{g.bank ? t.pay.editBank : t.pay.addBank}<span className="visually-hidden"> · {g.name}</span></button>
          </div>
          <hr className="rule" />
          <ul className="rows">
            {g.rows.map(r => (
              <li key={r.id} className="row">
                <Thumb row={r} />
                <a className="main" href={r.href}><span className="what">{r.what}</span><span className="sub"><span className="mono">{r.day} {r.month}</span>{r.sub && <span>{r.sub}</span>}<Warnings list={r.warnings} /></span></a>
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
            <button type="submit" className="button quiet" disabled={pending}><Check />{t.pay.markPaid}</button>
          </form>
        </section>
      ))}
      <Dialog open={editing !== null} title={editing ? format(t.pay.bankFor, { name: editing.name }) : ""} closeLabel={t.close} onClose={() => setEditing(null)}>
        {editing && <BankForm owner={editing.owner} current={editing.bank && { masked: editing.bank.masked, bic: editing.bank.bic, holder: editing.bank.holder, since: editing.bank.since }} t={t.bank} errors={t.errors} save={t.pay.saveBank} cancel={t.cancel} idPrefix="person-bank" onDone={() => setEditing(null)} />}
      </Dialog>
      {files.length > 0 && (
        <section className="section" aria-label={t.pay.files}>
          <h2><span>{t.pay.files}</span></h2>
          <ul className="rows">
            {files.map(f => (
              <li key={f.id} className="row file-row">
                <span className="thumb" aria-hidden="true"><FileIcon /></span>
                <span className="main"><span className="what">{f.title}</span><span className="sub">{f.sub}</span></span>
                <span className="right">
                  {f.cancelled
                    ? <span className="stamp">{t.pay.cancelledTag}</span>
                    : (
                      <span className="decide">
                        <a className="button small quiet" href={`/chest/pay/files/${f.id}`} download><Download />{t.pay.download}</a>
                        <button type="button" className="button small danger" disabled={pending} onClick={() => cancelFile(f.id)} title={t.pay.cancelHint}>{t.pay.cancelFile}</button>
                      </span>
                    )}
                </span>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ marginTop: 8 }}>{t.pay.cancelHint}</p>
        </section>
      )}
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
