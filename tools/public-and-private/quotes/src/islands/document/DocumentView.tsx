import { call, navigate, refresh, toast, type Outcome } from "@argentic/chest-app/client";
import { useCallback, useRef, useState } from "react";
import { Back, Coins, Copy, Download, Invoice, Seal, Send, Trash, Bell, Check, Close, Repeat } from "../../components/icons.tsx";
import { Stamp } from "../../components/stamp.tsx";
import { format, formatDay } from "../../i18n/format.ts";
import type { Catalogue, Locale } from "../../i18n/index.ts";
import { formatMoney } from "../../shared/money.ts";
import type { ClientOption, DocView, Fact, Moment, OnlineView, PaymentView, RelatedView, Rights, VersionView } from "../../lib/views.ts";
import type { DocWords } from "../../lib/views.ts";
import type { MailState } from "../../lib/mailing.ts";
import { CopyLink } from "../CopyLink.tsx";
import { FinaliseDialog, InvoiceDialog, PaymentDialog, RepeatDialog, SendDialog } from "./dialogs.tsx";
import { Paper, type SaveState } from "./paper.tsx";

// A document's page: the paper, and in its margin what it is now and the
// one thing to do next — send it, record the client's answer, invoice it,
// finalise it, record a payment — with the rest a click further.

export type DocumentViewProps = {
  doc: DocView;
  t: DocWords;
  words: Record<Locale, Catalogue["pdf"]>;
  locale: Locale;
  today: string;
  todayText: string;
  dates: { issue: string; due: string; valid: string; delivery: string; reference: string };
  rights: Rights;
  clients: ClientOption[];
  logo: string | null;
  facts: Fact[];
  history: Moment[];
  payments: PaymentView[];
  related: RelatedView[];
  mailWorks: boolean | null;
  mailReason: MailState["reason"];
  upcoming: string | null;
  companyMissing: string[];
  clientMissing: string[];
  readyText: string | null;
  // The first dates a repeat would suggest, per period (an issued invoice).
  repeatDates: Record<"month" | "quarter" | "year", string> | null;
  // A sent quote's online answer: its link and the answers given.
  online: OnlineView | null;
  // A quote's earlier versions, the latest first.
  versions: VersionView[];
};

type Open = "send" | "reminder" | "finalise" | "invoice" | "payment" | "repeat" | null;

export function DocumentView(props: DocumentViewProps) {
  const { doc, t, locale, rights } = props;
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const [save, setSave] = useState<SaveState>("saved");
  const [gross, setGross] = useState(doc.gross);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const d = t.doc;
  const onState = useCallback((s: SaveState) => setSave(s), []);
  const onTotals = useCallback((g: number) => setGross(g), []);

  // One toast per document: a new step replaces the last one's.
  const say = (text: string, more: { undo?: () => Promise<boolean | string>; sent?: boolean } = {}) => toast({ id: `doc-${doc.id}`, text, ...more });
  async function ready(): Promise<boolean> {
    const ok = await flushRef.current();
    if (!ok) toast({ text: d.fixFirst, tone: "error" });
    return ok;
  }
  // A step of the margin: the paper saved first, then the action (its
  // refusal is the package's toast, in the member's words).
  async function run<T>(step: () => Promise<Outcome<T>>, done?: (value: T) => void) {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await ready())) return;
      const result = await step();
      if (result.ok) done?.(result.value);
    } finally {
      setBusy(false);
    }
  }
  // An Undo's own call: quiet (the toast says whether it worked).
  const undoWith = (step: () => Promise<Outcome<unknown>>, after?: () => void) => async () => {
    const back = await step();
    if (back.ok) after?.();
    return back.ok || back.message;
  };
  const openDialog = async (which: Open) => { if (await ready()) setOpen(which); };
  const pdfHref = `/chest/documents/${doc.id}/pdf?download`;
  async function downloadPdf(e: React.MouseEvent) {
    e.preventDefault();
    if (await ready()) location.assign(pdfHref);
  }

  const listHref = doc.type === "quote" ? "/chest/quotes" : "/chest/invoices";
  const draft = doc.status === "draft";
  const quote = doc.type === "quote";
  const invoice = doc.type === "invoice";
  const credit = doc.type === "credit";
  const final = doc.status === "final";
  // An invoice imported from the previous tool: only collected here.
  const collectable = final || doc.imported;
  const canFinalise = rights.issue && draft && !quote;
  // The next version of a sent quote, being written.
  const nextVersion = quote && draft && doc.version > 1;

  const primary = (() => {
    if (quote) {
      if (!rights.quote) return null;
      if (draft) return <button type="button" className="button block" onClick={() => void openDialog("send")}><Send />{nextVersion ? format(d.actions.sendVersion, { version: doc.version }) : d.actions.send}</button>;
      if (doc.state === "sent" || doc.state === "expired") return (
        <>
          <button type="button" className="button block" onClick={() => void run(() => call("decide", { id: doc.id, decision: "accepted" }), () => say(d.toasts.accepted))}><Check />{d.actions.accepted}</button>
          <button type="button" className="button quiet block" onClick={() => void run(() => call("decide", { id: doc.id, decision: "refused" }), () => say(d.toasts.refused, { undo: undoWith(() => call("decide", { id: doc.id, decision: "sent" }, { quiet: true })) }))}><Close />{d.actions.refused}</button>
        </>
      );
      if (doc.state === "accepted" && rights.draftInvoice) return <button type="button" className="button block" onClick={() => setOpen("invoice")}><Invoice />{d.actions.makeInvoice}</button>;
      return null;
    }
    if (draft) {
      if (canFinalise) return <button type="button" className="button block" onClick={() => void openDialog("finalise")}><Seal />{credit ? d.actions.finaliseCredit : d.actions.finalise}</button>;
      if (invoice && rights.draftInvoice) return props.readyText
        ? <p className="hint">{props.readyText}</p>
        : <button type="button" className="button block" onClick={() => void run(() => call("markReady", { id: doc.id }), () => say(d.toasts.ready, { sent: true }))}><Bell />{d.actions.handToBilling}</button>;
      return null;
    }
    if (final && !doc.sentAt && rights.issue) return <button type="button" className="button block" onClick={() => setOpen("send")}><Send />{d.actions.sendToClient}</button>;
    // Late, the job is the reminder; otherwise the payment.
    if (invoice && collectable && doc.due > 0 && rights.pay && doc.state === "overdue") return <button type="button" className="button block" onClick={() => setOpen("reminder")}><Bell />{d.actions.remind}</button>;
    if (invoice && collectable && doc.due > 0 && rights.pay) return <button type="button" className="button block" onClick={() => setOpen("payment")}><Coins />{d.actions.recordPayment}</button>;
    return null;
  })();

  const secondary: { key: string; node: React.ReactNode }[] = [];
  const add = (key: string, node: React.ReactNode) => secondary.push({ key, node });
  if (!doc.imported) add("pdf", <a className="link-button" href={pdfHref} download onClick={e => void downloadPdf(e)}><Download /> {draft ? d.actions.previewPdf : d.actions.downloadPdf}</a>);
  // A sent quote changes through its next version (the client keeps what
  // was sent until the new one goes); Undo drops it.
  if (quote && rights.quote && (doc.state === "sent" || doc.state === "expired")) add("revise", <button type="button" className="link-button" onClick={() => void run(() => call("reviseQuote", { id: doc.id }), v => {
    say(format(d.toasts.revised, { version: v.version }), { undo: undoWith(() => call("discardVersion", { id: doc.id }, { quiet: true })) });
  })}>{d.actions.revise}</button>);
  if (quote && rights.quote && !draft && doc.state !== "refused") add("resend", <button type="button" className="link-button" onClick={() => void openDialog("send")}>{d.actions.sendAgain}</button>);
  if (final && doc.sentAt && rights.issue) add("resend", <button type="button" className="link-button" onClick={() => setOpen("send")}>{d.actions.sendAgain}</button>);
  if (invoice && collectable && doc.due > 0 && rights.pay && ((final && doc.sentAt === null) || doc.state === "overdue")) add("pay", <button type="button" className="link-button" onClick={() => setOpen("payment")}>{d.actions.recordPayment}</button>);
  if (invoice && collectable && doc.due > 0 && rights.pay && doc.state !== "overdue") add("remind", <button type="button" className="link-button" onClick={() => setOpen("reminder")}>{d.actions.remind}</button>);
  if (invoice && final && doc.depositPercent === null && rights.issue && !doc.repeat && props.repeatDates) add("repeat", <button type="button" className="link-button" onClick={() => setOpen("repeat")}><Repeat /> {d.actions.repeat}</button>);
  if (doc.repeat && rights.issue) add("stop", <button type="button" className="link-button" onClick={() => void run(() => call("stopRepeat", { id: doc.repeat!.id }), () => say(d.toasts.repeatStopped))}>{d.actions.stopRepeat}</button>);
  if (invoice && final && rights.issue && doc.credited < doc.gross) add("credit", <button type="button" className="link-button" onClick={() => void run(() => call("startCreditNote", { id: doc.id }, { refresh: false }), v => { say(d.toasts.creditStarted); void navigate(`/chest/documents/${v.id}`); })}>{d.actions.creditNote}</button>);
  if (quote && rights.quote && (doc.state === "accepted" || doc.state === "refused")) add("reopen", <button type="button" className="link-button" onClick={() => void run(() => call("decide", { id: doc.id, decision: "sent" }), () => say(d.toasts.reopened))}>{d.actions.reopen}</button>);
  if (!credit && (quote ? rights.quote : rights.draftInvoice)) add("copy", <button type="button" className="link-button" onClick={() => void run(() => call("duplicate", { id: doc.id }, { refresh: false }), v => { say(d.toasts.copied); void navigate(`/chest/documents/${v.id}`); })}><Copy /> {d.actions.duplicate}</button>);
  if (nextVersion && rights.edit) add("discard", <button type="button" className="link-button danger" onClick={() => void run(() => call("discardVersion", { id: doc.id }), () => say(format(d.toasts.discarded, { version: doc.version })))}>
    <Trash /> {format(d.actions.discardVersion, { version: doc.version })}</button>);
  if (draft && rights.edit && !nextVersion) add("delete", <button type="button" className="link-button danger" onClick={() => void run(() => call("removeDraft", { id: doc.id }, { refresh: false }), () => {
    say(d.toasts.deleted, { undo: undoWith(() => call("restoreDraft", { id: doc.id }, { quiet: true, refresh: false }), () => void navigate(`/chest/documents/${doc.id}`)) });
    void navigate(listHref);
  })}><Trash /> {d.actions.deleteDraft}</button>);

  const saveText = save === "saving" ? d.save.saving : save === "pending" ? d.save.pending : save === "invalid" ? d.save.invalid : save === "error" ? d.save.error : d.save.saved;
  const stateLabel = t.states[doc.state];

  return (
    <div className="page">
      <a className="back" href={listHref}><Back />{quote ? t.shell.quotes : t.shell.invoices}</a>
      <div className="document">
        <div>
          {rights.edit && (
            <p className={save === "invalid" || save === "error" ? "save-state error" : "save-state"} role="status" aria-live="polite">
              {nextVersion ? format(d.editingSent, { version: doc.version }) + " · " : ""}{saveText}
            </p>
          )}
          {doc.imported ? (
            <section className="card imported-note">
              <h2>{format(d.importedTitle, { number: doc.number ?? "" })}</h2>
              <p>{d.importedBody}</p>
              <dl className="facts">
                <div className="fact"><dt>{t.list.head.client}</dt><dd>{doc.buyer?.name ?? t.list.noClient}</dd></div>
                <div className="fact"><dt>{d.facts.issued}</dt><dd>{props.dates.issue}</dd></div>
              </dl>
            </section>
          ) : (
            <Paper doc={doc} t={t} words={props.words} locale={locale} today={props.today} dateWords={t.kit.date} editing={rights.edit} clients={props.clients} canAddClient={rights.quote}
              logo={props.logo} dates={props.dates} flushRef={flushRef} onState={onState} onTotals={onTotals} />
          )}
        </div>
        <aside className="side" aria-label={d.margin}>
          <section className="card">
            <Stamp state={doc.state} label={stateLabel} big />
            <h2>{doc.kindText} {doc.number ?? ""}</h2>
            <p className="hint">{nextVersion ? format(d.versionDraft, { version: doc.version, previous: doc.version - 1 }) : d.explain[doc.state]}</p>
            {doc.crmTitle && <p className="hint from-crm">{format(d.fromCrm, { title: doc.crmTitle })}</p>}
            {doc.timesheets && (
              <p className="hint from-crm from-timesheets">
                {format(d.fromTimesheets, { project: doc.timesheets.project })}
                {doc.timesheets.link && <> · <a href={doc.timesheets.link}>{d.openTimesheets}</a></>}
                {!doc.clientId && doc.timesheets.client && <><br /><strong>{format(d.timesheetsClient, { name: doc.timesheets.client })}</strong></>}
                {doc.timesheets.counted && <><br />{doc.timesheets.counted}</>}
              </p>
            )}
            {doc.madeFrom && <p className="hint from-crm"><a href={`/chest/documents/${doc.madeFrom.id}`}>{format(d.madeFrom, { number: doc.madeFrom.number })}</a></p>}
            {doc.repeat && <p className="hint repeat-note"><Repeat /> {format(d.repeats, { every: d.every[doc.repeat.every], date: doc.repeat.next })}</p>}
            <dl className="facts">
              {props.facts.map(f => (
                <div key={f.label} className="fact">
                  <dt>{f.label}</dt>
                  <dd className={f.strong ? "strong" : undefined} suppressHydrationWarning>{f.label === t.doc.facts.total ? formatMoney(gross, doc.currency, locale) : f.value}</dd>
                </div>
              ))}
            </dl>
            {primary && <div className="actions wide-actions">{primary}</div>}
            {secondary.length > 0 && <div className="more">{secondary.map(s => <span key={s.key}>{s.node}</span>)}</div>}
          </section>
          {props.online && <OnlineCard docId={doc.id} online={props.online} t={t} canWrite={rights.quote} waiting={doc.state === "sent"} revising={nextVersion} onDone={(text: string) => say(text)} />}
          {props.versions.length > 0 && (
            <section className="card versions" aria-labelledby="versions-title">
              <h2 id="versions-title">{d.versions.title}</h2>
              <ul className="related">
                {props.versions.map(v => (
                  <li key={v.version}>
                    {v.pdf ? <a href={v.pdf}><span>{v.text}</span><span className="num"><Download /><span className="ck-vh">{format(d.versions.pdf, { version: v.version })}</span></span></a>
                      : <span><span>{v.text}</span><span className="hint">{d.versions.noPdf}</span></span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
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
                        onClick={() => void run(() => call("removePayment", { id: p.id }), () => toast({ id: `payment-${p.id}`, text: d.toasts.paymentRemoved, undo: undoWith(() => call("restorePayment", { id: p.id }, { quiet: true })) }))}><Trash /></button>
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

      {primary && (
        <div className="phone-action" data-ck-bottom-bar>
          <span className="phone-total"><span className="hint">{t.doc.facts.total}</span><b className="num" suppressHydrationWarning>{formatMoney(gross, doc.currency, locale)}</b></span>
          <div className="actions">{primary}</div>
        </div>
      )}

      {(open === "send" || open === "reminder") && (
        <SendDialog t={t} doc={doc} kind={open} mailWorks={props.mailWorks} mailReason={props.mailReason} pdfHref={pdfHref} onClose={() => setOpen(null)} onDone={(text, emailed) => { setOpen(null); say(text, emailed ? { sent: true } : {}); }} />
      )}
      {open === "finalise" && (
        <FinaliseDialog t={t} doc={doc} upcoming={props.upcoming} companyMissing={props.companyMissing} clientMissing={props.clientMissing} canSettings={props.rights.settings}
          onClose={() => setOpen(null)} onDone={number => { setOpen(null); say(format(credit ? d.toasts.creditFinalised : d.toasts.finalised, { number })); }} />
      )}
      {open === "invoice" && <InvoiceDialog t={t} doc={doc} onClose={() => setOpen(null)} onDone={id => { setOpen(null); say(d.toasts.invoiceStarted); void navigate(`/chest/documents/${id}`); }} />}
      {open === "payment" && <PaymentDialog t={t} doc={doc} locale={locale} today={props.today} onClose={() => setOpen(null)} onDone={text => { setOpen(null); say(text); }} />}
      {open === "repeat" && props.repeatDates && <RepeatDialog t={t} doc={doc} today={props.today} suggested={props.repeatDates} onClose={() => setOpen(null)} onDone={date => { setOpen(null); say(format(d.toasts.repeatSet, { date: formatDay(date, locale, { day: "numeric", month: "long", year: "numeric" }) })); }} />}
    </div>
  );
}

// The quote's online answer, in the margin: the link to give the client
// (copied, or turned off; a new one made), and every answer given online
// with its proof — the name typed, the day, the time, a hash of the
// visitor's address, their browser, the fingerprint of the exact PDF —
// and that PDF.
function OnlineCard({ docId, online, t, canWrite, waiting, revising, onDone }: { docId: string; online: OnlineView; t: DocWords; canWrite: boolean; waiting: boolean; revising: boolean; onDone: (text: string) => void }) {
  const o = t.doc.online;
  const [busy, setBusy] = useState(false);
  async function run(step: () => Promise<Outcome<unknown>>, text: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await step();
      if (result.ok) onDone(text);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card online" aria-labelledby="online-title">
      <h2 id="online-title">{o.title}</h2>
      {online.live ? (
        <>
          <p className="hint">{revising ? o.explainRevising : waiting ? format(o.explain, { date: online.until }) : o.explainAnswered}</p>
          {online.url ? <CopyLink url={online.url} label={o.linkLabel} copy={o.copy} done={o.copied} /> : <p className="hint">{o.noAddress}</p>}
          {canWrite && <p className="more"><button type="button" className="link-button" disabled={busy} onClick={() => void run(() => call("revokeLink", { id: docId }), o.offDone)}>{o.off}</button></p>}
        </>
      ) : (
        <>
          <p className="hint">{o.none}</p>
          {canWrite && waiting && <p><button type="button" className="button quiet small" disabled={busy} onClick={() => void run(() => call("renewLink", { id: docId }), o.renewed)}>{o.renew}</button></p>}
        </>
      )}
      {online.answers.map(a => (
        <details key={a.id} className="proof">
          <summary><span className={a.accepted ? "tag ok" : "tag"}>{a.title}</span> <span className="when">{a.when}</span></summary>
          {a.reason && <blockquote>{a.reason}</blockquote>}
          <dl className="facts">
            {a.proof.map(f => <div key={f.label} className="fact"><dt>{f.label}</dt><dd className="proof-value">{f.value}</dd></div>)}
          </dl>
          {a.pdf && <p><a className="link-button" href={a.pdf}><Download /> {o.proofPdf}</a></p>}
          <p className="hint">{o.notSignature}</p>
        </details>
      ))}
    </section>
  );
}
