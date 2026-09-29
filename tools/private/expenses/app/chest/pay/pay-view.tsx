"use client";

import { Avatar, DateField, Dialog, EmptyState, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BankForm } from "../../../components/bank-form.tsx";
import { DateBox, RowStamp, Stamp, Thumb, Warning, Warnings } from "../../../components/bits.tsx";
import { Check, Download, FileIcon, Wallet } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { formatMoney } from "../../../lib/money.ts";
import type { RowView } from "../../../lib/rows.ts";
import { cancelTransferFile, makeTransferFile, markPaid, unmarkPaid } from "../actions.ts";

type Bank = { masked: string; bic: string | null; holder: string; since: string; sepa: boolean; changed: string | null };
export type PayGroup = { owner: string; name: string; photo: string | null; total: string; summary: string; rows: RowView[]; bank: Bank | null };
type FileLine = { id: string; title: string; sub: string; cancelled: boolean };
type Words = { pay: Catalogue["pay"]; errors: Catalogue["errors"]; bank: Catalogue["settings"]["bank"]; cancel: string; dialog: Catalogue["dialog"]; date: Catalogue["date"] };

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
  const [typing, setTyping] = useState(false);
  const errorText = (r: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => format(t.errors[r.error], r.values ?? {});

  function pay(g: PayGroup) {
    const ids = g.rows.map(r => r.id);
    const day = dates[g.owner] ?? today;
    setGone(set => new Set([...set, g.owner]));
    start(async () => {
      const result = await markPaid(ids, day);
      if (!result.ok) {
        setGone(set => new Set([...set].filter(o => o !== g.owner)));
        return void toast({ text: errorText(result), tone: "error" });
      }
      // Undo puts the expenses back to pay, and takes back the "Paid back"
      // the person was told (the bell): the Undo tells the truth.
      toast({
        id: `paid-${g.owner}`,
        text: format(t.pay.marked, { total: g.total, name: g.name }),
        undo: async () => {
          const back = await unmarkPaid(ids);
          if (back.ok) setGone(set => new Set([...set].filter(o => o !== g.owner)));
          router.refresh();
          return back.ok ? true : errorText(back);
        },
      });
      router.refresh();
    });
  }

  function makeFile() {
    start(async () => {
      const result = await makeTransferFile(execution);
      if (!result.ok) return void toast({ text: errorText(result), tone: "error" });
      const { id, count, total, skipped } = result.value;
      const amount = formatMoney(total, "EUR", locale);
      // Undo cancels the file (its expenses go back to pay).
      toast({
        id: `file-${id}`,
        text: [plural(t.pay.made, count, locale, { total: amount }), skipped > 0 ? plural(t.pay.skipped, skipped, locale) : ""].filter(Boolean).join(" "),
        undo: async () => {
          const back = await cancelTransferFile(id);
          router.refresh();
          return back.ok ? true : errorText(back);
        },
      });
      download(id);
      router.refresh();
    });
  }

  function cancelFile(id: string) {
    start(async () => {
      const result = await cancelTransferFile(id);
      toast(result.ok ? { id: `file-${id}`, text: t.pay.cancelled } : { text: errorText(result), tone: "error" });
      router.refresh();
    });
  }

  const shown = groups.filter(g => !gone.has(g.owner));
  return (
    <>
      {shown.length > 0 && (
        <section className="paper flat by-file" aria-labelledby="by-file">
          <h2 id="by-file" className="by-file-title"><FileIcon />{t.pay.byFile}</h2>
          {ready === "ready" && preview && (
            <>
              <p className="hint">{t.pay.byFileBody}</p>
              <form className="pay-form" onSubmit={e => { e.preventDefault(); makeFile(); }}>
                <DateField id="execution" label={t.pay.execution} value={execution || null} onChange={d => setExecution(d ?? "")} today={today} min={today} labels={t.date} />
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
        <div className="paper">
          <EmptyState icon={<Wallet />} title={t.pay.empty.title} body={t.pay.empty.body} />
        </div>
      )}
      {shown.map(g => (
        <section key={g.owner} className="paper" aria-label={g.name}>
          <div className="person-head">
            <Avatar name={g.name} photo={g.photo} size="m" />
            <div className="grow">
              <div className="name">{g.name}</div>
              <div className="hint">{g.summary}</div>
            </div>
          </div>
          <div className="bank-line">
            {g.bank
              ? <span className="mono">{format(t.bank.current, { masked: g.bank.masked })}{!g.bank.sepa && <Warning text={t.pay.notSepa} />}</span>
              : <span className="hint">{t.pay.noBank}</span>}
            {g.bank?.changed && <Warning text={g.bank.changed} />}
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
          <form className="pay-form" onSubmit={e => { e.preventDefault(); pay(g); }}>
            <DateField id={`paid-${g.owner}`} label={t.pay.paidOn} value={dates[g.owner] ?? today} onChange={d => d && setDates(all => ({ ...all, [g.owner]: d }))} today={today} max={today} chips={[{ label: t.date.today, value: today }]} labels={t.date} />
            <button type="submit" className="button quiet" disabled={pending}><Check />{t.pay.markPaid}</button>
          </form>
        </section>
      ))}
      {/* Someone's bank details: the kit's dialog, which asks before losing
          an IBAN being typed. */}
      <Dialog open={editing !== null} title={editing ? format(t.pay.bankFor, { name: editing.name }) : ""} onClose={() => { setEditing(null); setTyping(false); }} dirty={typing} labels={t.dialog}>
        {editing && <BankForm owner={editing.owner} current={editing.bank && { masked: editing.bank.masked, bic: editing.bank.bic, holder: editing.bank.holder, since: editing.bank.since }} t={t.bank} errors={t.errors} save={t.pay.saveBank} cancel={t.cancel} idPrefix="person-bank" onDirty={setTyping} onDone={() => { setEditing(null); setTyping(false); }} />}
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
                    ? <Stamp kind="cancelled" text={t.pay.cancelledTag} />
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
          <p className="hint files-hint">{t.pay.cancelHint}</p>
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
                <span className="right"><span className="amount">{r.amount}</span><RowStamp row={r} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
