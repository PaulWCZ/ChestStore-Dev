"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Back, Coins, Copy, Download, Invoice, Seal, Send, Trash, Bell, Check, Close } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../../lib/i18n/index.ts";
import { formatMoney } from "../../../../lib/money.ts";
import type { ClientOption, DocView, Fact, ItemOption, Moment, PaymentView, RelatedView, Rights } from "../../../../lib/views.ts";
import { decide, duplicate, markReady, removeDraft, removePayment, restoreDraft, restorePayment, startCreditNote } from "../../actions.ts";
import { FinaliseDialog, InvoiceDialog, PaymentDialog, SendDialog } from "./dialogs.tsx";
import { Paper, type SaveState } from "./paper.tsx";

// A document's page: the paper, and in its margin what it is now and the
// one thing to do next — send it, record the client's answer, invoice it,
// finalise it, record a payment — with the rest a click further.

export type DocumentViewProps = {
  doc: DocView;
  t: Catalogue;
  words: Record<Locale, Catalogue["pdf"]>;
  locale: Locale;
  today: string;
  todayText: string;
  dates: { issue: string; due: string; valid: string; delivery: string; reference: string };
  rights: Rights;
  clients: ClientOption[];
  items: ItemOption[];
  logo: string | null;
  facts: Fact[];
  history: Moment[];
  payments: PaymentView[];
  related: RelatedView[];
  mailWorks: boolean | null;
  upcoming: string | null;
  companyMissing: string[];
  clientMissing: string[];
  readyText: string | null;
};

type Open = "send" | "reminder" | "finalise" | "invoice" | "payment" | null;

export function DocumentView(props: DocumentViewProps) {
  const { doc, t, locale, rights } = props;
  const router = useRouter();
  const toast = useToast();
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const [save, setSave] = useState<SaveState>("saved");
  const [gross, setGross] = useState(doc.gross);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const d = t.doc;
  const onState = useCallback((s: SaveState) => setSave(s), []);
  const onTotals = useCallback((g: number) => setGross(g), []);

  const fail = (error: string, values?: Record<string, number | string>) => toast(format(t.errors[error as keyof Catalogue["errors"]] ?? t.errors.unknown, values ?? {}));
  async function ready(): Promise<boolean> {
    const ok = await flushRef.current();
    if (!ok) toast(d.fixFirst);
    return ok;
  }
  async function run<T>(step: () => Promise<{ ok: true; value: T } | { ok: false; error: string; values?: Record<string, number | string> }>, done?: (value: T) => void) {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await ready())) return;
      const result = await step();
      if (!result.ok) fail(result.error, result.values);
      else done?.(result.value);
    } finally {
      setBusy(false);
    }
  }
  const openDialog = async (which: Open) => { if (await ready()) setOpen(which); };
  const pdfHref = `/chest/documents/${doc.id}/pdf?download`;
  async function downloadPdf(e: React.MouseEvent) {
    e.preventDefault();
    if (await ready()) window.location.href = pdfHref;
  }

  const listHref = doc.type === "quote" ? "/chest/quotes" : "/chest/invoices";
  const draft = doc.status === "draft";
  const quote = doc.type === "quote";
  const invoice = doc.type === "invoice";
  const credit = doc.type === "credit";
  const final = doc.status === "final";
  const canFinalise = rights.issue && draft && !quote;

  const primary = (() => {
    if (quote) {
      if (!rights.quote) return null;
      if (draft) return <button type="button" className="button block" onClick={() => void openDialog("send")}><Send />{d.actions.send}</button>;
      if (doc.state === "sent" || doc.state === "expired") return (
        <>
          <button type="button" className="button block" onClick={() => void run(() => decide(doc.id, "accepted"), () => toast(d.toasts.accepted))}><Check />{d.actions.accepted}</button>
          <button type="button" className="button quiet block" onClick={() => void run(() => decide(doc.id, "refused"), () => toast(d.toasts.refused, { label: t.common.undo, run: () => void decide(doc.id, "sent") }))}><Close />{d.actions.refused}</button>
        </>
      );
      if (doc.state === "accepted" && rights.draftInvoice) return <button type="button" className="button block" onClick={() => setOpen("invoice")}><Invoice />{d.actions.makeInvoice}</button>;
      return null;
    }
    if (draft) {
      if (canFinalise) return <button type="button" className="button block" onClick={() => void openDialog("finalise")}><Seal />{credit ? d.actions.finaliseCredit : d.actions.finalise}</button>;
      if (invoice && rights.draftInvoice) return props.readyText
        ? <p className="hint">{props.readyText}</p>
        : <button type="button" className="button block" onClick={() => void run(() => markReady(doc.id), () => toast(d.toasts.ready))}><Bell />{d.actions.handToBilling}</button>;
      return null;
    }
    if (final && !doc.sentAt && rights.issue) return <button type="button" className="button block" onClick={() => setOpen("send")}><Send />{d.actions.sendToClient}</button>;
    if (invoice && final && doc.due > 0 && rights.pay) return <button type="button" className="button block" onClick={() => setOpen("payment")}><Coins />{d.actions.recordPayment}</button>;
    return null;
  })();

  const secondary: { key: string; node: React.ReactNode }[] = [];
  const add = (key: string, node: React.ReactNode) => secondary.push({ key, node });
  add("pdf", <a className="link-button" href={pdfHref} onClick={e => void downloadPdf(e)}><Download /> {draft ? d.actions.previewPdf : d.actions.downloadPdf}</a>);
  if (quote && rights.quote && !draft && doc.state !== "refused") add("resend", <button type="button" className="link-button" onClick={() => void openDialog("send")}>{d.actions.sendAgain}</button>);
  if (final && doc.sentAt && rights.issue) add("resend", <button type="button" className="link-button" onClick={() => setOpen("send")}>{d.actions.sendAgain}</button>);
  if (invoice && final && doc.due > 0 && rights.pay && doc.sentAt === null) add("pay", <button type="button" className="link-button" onClick={() => setOpen("payment")}>{d.actions.recordPayment}</button>);
  if (invoice && final && doc.due > 0 && rights.pay) add("remind", <button type="button" className="link-button" onClick={() => setOpen("reminder")}>{d.actions.remind}</button>);
  if (invoice && final && rights.issue && doc.credited < doc.gross) add("credit", <button type="button" className="link-button" onClick={() => void run(() => startCreditNote(doc.id), v => { toast(d.toasts.creditStarted); router.push(`/chest/documents/${v.id}`); })}>{d.actions.creditNote}</button>);
  if (quote && rights.quote && (doc.state === "accepted" || doc.state === "refused")) add("reopen", <button type="button" className="link-button" onClick={() => void run(() => decide(doc.id, "sent"), () => toast(d.toasts.reopened))}>{d.actions.reopen}</button>);
  if (!credit && (quote ? rights.quote : rights.draftInvoice)) add("copy", <button type="button" className="link-button" onClick={() => void run(() => duplicate(doc.id), v => { toast(d.toasts.copied); router.push(`/chest/documents/${v.id}`); })}><Copy /> {d.actions.duplicate}</button>);
  if (draft && rights.edit) add("delete", <button type="button" className="link-button danger" onClick={() => void run(async () => removeDraft(doc.id), () => {
    toast(d.toasts.deleted, { label: t.common.undo, run: () => void restoreDraft(doc.id).then(() => router.push(`/chest/documents/${doc.id}`)) });
    router.push(listHref);
  })}><Trash /> {d.actions.deleteDraft}</button>);

  const saveText = save === "saving" ? d.save.saving : save === "pending" ? d.save.pending : save === "invalid" ? d.save.invalid : save === "error" ? d.save.error : d.save.saved;
  const stateLabel = t.states[doc.state];

  return (
    <main className="page">
      <a className="back" href={listHref}><Back />{quote ? t.shell.quotes : t.shell.invoices}</a>
      <div className="document">
        <div>
          {rights.edit && (
            <p className={save === "invalid" || save === "error" ? "save-state error" : "save-state"} role="status" aria-live="polite">
              {doc.status === "sent" ? d.editingSent + " · " : ""}{saveText}
            </p>
          )}
          <Paper doc={doc} t={t} words={props.words} locale={locale} editing={rights.edit} clients={props.clients} items={props.items} canAddClient={rights.quote}
            logo={props.logo} dates={props.dates} flushRef={flushRef} onState={onState} onTotals={onTotals} />
        </div>
        <aside className="side" aria-label={d.margin}>
          <section className="card">
            <span className={`stamp big ${doc.state}`}>{stateLabel}</span>
            <h2>{doc.kindText} {doc.number ?? ""}</h2>
            <p className="hint">{d.explain[doc.state]}</p>
            <dl className="facts">
              {props.facts.map(f => (
                <div key={f.label} className="fact">
                  <dt>{f.label}</dt>
                  <dd className={f.strong ? "strong" : undefined} suppressHydrationWarning>{f.label === t.doc.facts.total ? formatMoney(gross, doc.currency, locale) : f.value}</dd>
                </div>
              ))}
            </dl>
            {primary && <div className="actions">{primary}</div>}
            {secondary.length > 0 && <div className="more">{secondary.map(s => <span key={s.key}>{s.node}</span>)}</div>}
          </section>
          {props.payments.length > 0 && (
            <section className="card">
              <h2>{d.payments}</h2>
              <ul className="payments">
                {props.payments.map(p => (
                  <li key={p.id}>
                    <span>{p.date} · {p.method}{p.note ? " · " + p.note : ""}</span>
                    <b className="num">{p.amount}</b>
                    {rights.pay ? (
                      <button type="button" className="icon-button" aria-label={format(d.removePayment, { amount: p.amount, date: p.date })} title={t.common.remove}
                        onClick={() => void run(() => removePayment(p.id), () => toast(d.toasts.paymentRemoved, { label: t.common.undo, run: () => void restorePayment(p.id).then(r => { if (!r.ok) fail(r.error); }) }))}><Trash /></button>
                    ) : <span />}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {props.related.length > 0 && (
            <section className="card">
              <h2>{d.related}</h2>
              <ul className="related">
                {props.related.map(r => <li key={r.id}><a href={`/chest/documents/${r.id}`}><span>{r.text}</span><span className="num">{r.amount}</span></a></li>)}
              </ul>
            </section>
          )}
          <section className="card">
            <h2>{d.history.title}</h2>
            <ol className="timeline">
              {props.history.map(h => <li key={h.text + h.when}><span>{h.text}<br /><span className="when">{h.when}</span></span></li>)}
            </ol>
          </section>
        </aside>
      </div>

      {(open === "send" || open === "reminder") && (
        <SendDialog t={t} doc={doc} kind={open} mailWorks={props.mailWorks} pdfHref={pdfHref} onClose={() => setOpen(null)} onDone={text => { setOpen(null); toast(text); }} />
      )}
      {open === "finalise" && (
        <FinaliseDialog t={t} doc={doc} upcoming={props.upcoming} companyMissing={props.companyMissing} clientMissing={props.clientMissing} canSettings={props.rights.settings}
          onClose={() => setOpen(null)} onDone={number => { setOpen(null); toast(format(credit ? d.toasts.creditFinalised : d.toasts.finalised, { number })); }} />
      )}
      {open === "invoice" && <InvoiceDialog t={t} doc={doc} onClose={() => setOpen(null)} onDone={id => { setOpen(null); toast(d.toasts.invoiceStarted); router.push(`/chest/documents/${id}`); }} />}
      {open === "payment" && <PaymentDialog t={t} doc={doc} locale={locale} today={props.today} onClose={() => setOpen(null)} onDone={text => { setOpen(null); toast(text); }} />}
    </main>
  );
}
