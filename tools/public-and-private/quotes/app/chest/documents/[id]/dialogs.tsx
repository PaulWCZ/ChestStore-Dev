"use client";

import { Confirm, DateField, Dialog } from "@argentic/chest-ui/components";
import { addDays } from "@argentic/chest-ui/components/logic";
import { useEffect, useRef, useState } from "react";
import { Alert, Download, Info, Send } from "../../../../components/icons.tsx";
import { format, languageNames } from "../../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../../lib/i18n/index.ts";
import { formatMoney, inputAmount, parsePercent } from "../../../../lib/money.ts";
import type { DocView, Message } from "../../../../lib/views.ts";
import type { MailState } from "../../../../lib/mailing.ts";
import { addPayment, finalise, invoiceFromQuote, markReminded, markSent, messageFor, remind, repeatInvoice, send } from "../../actions.ts";

type Close = { onClose: () => void };
const errorText = (t: Catalogue, code: string, values?: Record<string, number | string>) => format(t.errors[code as keyof Catalogue["errors"]] ?? t.errors.unknown, values ?? {});

// Sending a document (or a reminder) to the client: by email with the PDF,
// in the client's language, the words changeable; or by one's own means
// where the Chest cannot send email yet.
// `onDone` says whether an email left (its toast then never offers Undo).
export function SendDialog({ t, doc, kind, mailWorks, mailReason, pdfHref, onClose, onDone }: Close & { t: Catalogue; doc: DocView; kind: "send" | "reminder"; mailWorks: boolean | null; mailReason: MailState["reason"]; pdfHref: string; onDone: (text: string, emailed: boolean) => void }) {
  const s = t.send;
  const [message, setMessage] = useState<Message | null>(null);
  const [prepared, setPrepared] = useState<Message | null>(null);
  // A quote's email opens with its answer line: shown here, fixed.
  const [line, setLine] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [byHand, setByHand] = useState(mailWorks === false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void messageFor(doc.id, kind).then(r => {
      if (!live) return;
      if (r.ok) {
        const { line: first, terms: withTerms, ...words } = r.value;
        setMessage(words); setPrepared(words); setLine(first ?? null); setTerms(withTerms === true);
      }
      else setError(errorText(t, r.error, r.values));
    });
    return () => { live = false; };
  }, [doc.id, kind, t]);
  const title = kind === "reminder" ? s.reminderTitle : doc.type === "quote" && doc.number === null ? s.quoteTitle : s.title;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    const result = kind === "reminder" ? await remind(doc.id, message) : await send(doc.id, message);
    setBusy(false);
    if (!result.ok) return setError(errorText(t, result.error, result.values));
    if (result.value.delivery === "no_mail") {
      setByHand(true);
      return;
    }
    onDone(format(kind === "reminder" ? s.reminded : s.sent, { to: message.to }), true);
  }
  async function manual() {
    setBusy(true);
    const result = kind === "reminder" ? await markReminded(doc.id) : await markSent(doc.id);
    setBusy(false);
    if (!result.ok) return setError(errorText(t, result.error, result.values));
    onDone(kind === "reminder" ? s.remindedByHand : s.markedSent, false);
  }
  return (
    <Dialog open title={title} onClose={onClose} labels={t.dialog} size="l"
      dirty={!byHand && message !== null && prepared !== null && JSON.stringify(message) !== JSON.stringify(prepared)}>
      {byHand ? (
        <>
          <div className="callout quiet" role="note">
            <Info />
            <div>
              <p><strong>{mailWorks === false ? (mailReason ? s.noMailWhy[mailReason] : s.noMailTitle) : s.byHandTitle}</strong></p>
              <p>{kind === "reminder" ? s.noMailReminder : s.noMailBody}</p>
            </div>
          </div>
          <ol className="notice">
            <li>{s.step1}</li>
            <li>{kind === "reminder" ? s.step2Reminder : s.step2}</li>
            <li>{kind === "reminder" ? s.step3Reminder : s.step3}</li>
            {kind === "send" && doc.type === "quote" && <li>{s.step4Quote}</li>}
          </ol>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <a className="button quiet" href={pdfHref}><Download />{s.download}</a>
            <button type="button" className="button" disabled={busy} onClick={() => void manual()}>{kind === "reminder" ? s.markReminded : s.markSent}</button>
          </div>
          <button type="button" className="link-button" onClick={() => setByHand(false)}>{s.tryEmail}</button>
        </>
      ) : !message ? (
        error ? <p className="error" role="alert">{error}</p> : <p className="muted" role="status">{s.preparing}</p>
      ) : (
        <form className="form-grid" onSubmit={submit} noValidate>
          <div className="field-row">
            <label htmlFor="to">{s.to}</label>
            <input id="to" className="field" type="email" value={message.to} required maxLength={254} onChange={e => setMessage({ ...message, to: e.target.value })} aria-describedby={message.to ? undefined : "to-hint"} />
            {!message.to && <span className="hint" id="to-hint">{s.noAddress}</span>}
          </div>
          <div className="field-row">
            <label htmlFor="subject">{s.subject}</label>
            <input id="subject" className="field" value={message.subject} required maxLength={200} onChange={e => setMessage({ ...message, subject: e.target.value })} />
          </div>
          <div className="field-row">
            <label htmlFor="text">{s.message}</label>
            {line && (
              <p className="fixed-line" id="answer-line">
                <span className="hint">{s.lineLabel}</span>
                <span className="line-text">{line}</span>
              </p>
            )}
            <textarea id="text" className="field" rows={9} value={message.text} maxLength={4000} onChange={e => setMessage({ ...message, text: e.target.value })} aria-describedby={line ? "answer-line" : undefined} />
            <span className="hint">{format(terms ? s.attachedTerms : s.attached, { language: languageNames[doc.language] ?? doc.language })}{line ? " " + s.withLink : ""}</span>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="button ghost" onClick={() => setByHand(true)}>{s.myself}</button>
            <button type="submit" className="button" disabled={busy}><Send />{busy ? s.sending : kind === "reminder" ? s.sendReminder : s.send}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// Finalising: the one step that cannot be taken back. It says what will
// happen in plain words, and what is missing first.
export function FinaliseDialog({ t, doc, upcoming, companyMissing, clientMissing, canSettings, onClose, onDone }: Close & { t: Catalogue; doc: DocView; upcoming: string | null; companyMissing: string[]; clientMissing: string[]; canSettings: boolean; onDone: (number: string) => void }) {
  const f = t.finalise;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blocked = companyMissing.length > 0 || clientMissing.length > 0 || !doc.clientId;
  const title = doc.type === "credit" ? f.creditTitle : f.title;
  async function go() {
    setBusy(true);
    const result = await finalise(doc.id);
    setBusy(false);
    if (!result.ok) return setError(errorText(t, result.error, result.values));
    onDone(result.value.number);
  }
  if (!blocked) {
    // The act that cannot be taken back: the kit's Confirm (it opens on
    // "Not yet"; its button repeats the act and the number).
    return (
      <Confirm open tone="accent" title={title} busy={busy}
        body={<><p>{format(doc.type === "credit" ? f.creditBody : f.body, { number: upcoming ?? "" })}</p><p className="hint">{f.law}</p></>}
        confirmLabel={format(f.confirm, { number: upcoming ?? "" })} cancelLabel={f.notYet} onConfirm={() => void go()} onCancel={onClose}>
        {error && <p className="error" role="alert">{error}</p>}
      </Confirm>
    );
  }
  return (
    <Dialog open title={title} onClose={onClose} labels={t.dialog}>
      <div className="callout" role="note">
        <Alert />
        <div>
          {companyMissing.length > 0 && (
            <>
              <p><strong>{f.companyMissing}</strong></p>
              <ul className="missing-list">{companyMissing.map(m => <li key={m}>{t.settings.fields[m as keyof Catalogue["settings"]["fields"]] ?? m}</li>)}</ul>
              {!canSettings && <p>{f.askAdmin}</p>}
            </>
          )}
          {!doc.clientId && <p><strong>{t.errors.no_client}</strong></p>}
          {clientMissing.some(m => m !== "vatNumber") && <p><strong>{f.clientMissing}</strong></p>}
          {clientMissing.includes("vatNumber") && <p><strong>{f.clientVatMissing}</strong></p>}
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
        {companyMissing.length !== 0 && canSettings && <a className="button" href="/chest/settings">{f.toSettings}</a>}
        {clientMissing.length !== 0 && doc.clientId && <a className="button" href={`/chest/clients/${doc.clientId}`}>{f.toClient}</a>}
      </div>
    </Dialog>
  );
}

// An accepted quote becomes an invoice: all of it, or a deposit first.
export function InvoiceDialog({ t, doc, onClose, onDone }: Close & { t: Catalogue; doc: DocView; onDone: (id: string) => void }) {
  const w = t.fromQuote;
  const [mode, setMode] = useState<"whole" | "deposit">("whole");
  const [percent, setPercent] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = parsePercent(percent);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "deposit" && (value === null || value < 1 || value > 9999)) return setError(t.errors.percent_invalid);
    setBusy(true);
    const result = await invoiceFromQuote(doc.id, mode === "deposit" ? value : null);
    setBusy(false);
    if (!result.ok) return setError(errorText(t, result.error, result.values));
    onDone(result.value.id);
  }
  return (
    <Dialog open title={w.title} onClose={onClose} labels={t.dialog} dirty={mode !== "whole" || percent !== "30"}>
      <form className="form-grid" onSubmit={submit} noValidate>
        <fieldset className="choice">
          <legend>{w.what}</legend>
          <label className="option"><input type="radio" name="mode" checked={mode === "whole"} onChange={() => setMode("whole")} /><span>{w.whole}</span><span className="sub">{w.wholeHint}</span></label>
          <label className="option"><input type="radio" name="mode" checked={mode === "deposit"} onChange={() => setMode("deposit")} /><span>{w.deposit}</span><span className="sub">{w.depositHint}</span></label>
        </fieldset>
        {mode === "deposit" && (
          <div className="field-row third">
            <label htmlFor="percent">{w.percent}</label>
            <input id="percent" className="field num" inputMode="decimal" value={percent} onChange={e => setPercent(e.target.value)} aria-invalid={value === null ? true : undefined} />
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
          <button type="submit" className="button" disabled={busy}>{w.make}</button>
        </div>
      </form>
    </Dialog>
  );
}

// A payment received: the date, the amount (what is left, to begin with),
// the method.
export function PaymentDialog({ t, doc, locale, today, onClose, onDone }: Close & { t: Catalogue; doc: DocView; locale: Locale; today: string; onDone: (text: string) => void }) {
  const p = t.payment;
  const [paidOn, setPaidOn] = useState<string | null>(today);
  const [amount, setAmount] = useState(inputAmount(doc.due, doc.currency, locale));
  const [method, setMethod] = useState("transfer");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refused = useRefusedDay(setError);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (refused.stop("paid-on")) return;
    if (!paidOn) return setError(t.errors.date_invalid);
    setBusy(true);
    const result = await addPayment(doc.id, { paidOn, amount, method, note });
    setBusy(false);
    if (!result.ok) return setError(errorText(t, result.error, result.values ? { ...result.values, ...(typeof result.values["due"] === "number" ? { due: formatMoney(result.values["due"], doc.currency, locale) } : {}) } : undefined));
    onDone(result.value.due > 0 ? format(p.partly, { left: formatMoney(result.value.due, doc.currency, locale) }) : p.paid);
  }
  return (
    <Dialog open title={p.title} onClose={onClose} labels={t.dialog} dirty={amount !== inputAmount(doc.due, doc.currency, locale) || note !== "" || paidOn !== today || method !== "transfer"}>
      <form className="form-grid" onSubmit={submit} noValidate>
        <div className="field-row half">
          <label htmlFor="amount">{p.amount}</label>
          <input id="amount" className="field num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          <span className="hint">{format(p.left, { amount: formatMoney(doc.due, doc.currency, locale) })}</span>
        </div>
        <div className="half">
          <DateField id="paid-on" label={p.date} value={paidOn} onChange={setPaidOn} onProblem={refused.onProblem} today={today} max={today} required labels={t.date}
            chips={[{ label: t.date.today, value: today }, { label: t.date.yesterday, value: addDays(today, -1) }]} />
        </div>
        <div className="field-row half">
          <label htmlFor="method">{p.method}</label>
          <select id="method" className="field" value={method} onChange={e => setMethod(e.target.value)}>
            {(Object.keys(t.methods) as (keyof Catalogue["methods"])[]).map(m => <option key={m} value={m}>{t.methods[m]}</option>)}
          </select>
        </div>
        <div className="field-row half">
          <label htmlFor="note">{p.note}</label>
          <input id="note" className="field" value={note} maxLength={200} placeholder={p.notePlaceholder} onChange={e => setNote(e.target.value)} />
        </div>
        {doc.buyer?.kind === "person" && <p className="hint" role="note">{p.individual}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
          <button type="submit" className="button" disabled={busy}>{p.record}</button>
        </div>
      </form>
    </Dialog>
  );
}

// Repeating an issued invoice: every month, quarter or year, a draft is
// prepared for billing. The first date is one period after the invoice's.
export function RepeatDialog({ t, doc, today, suggested, onClose, onDone }: Close & { t: Catalogue; doc: DocView; today: string; suggested: Record<"month" | "quarter" | "year", string>; onDone: (date: string) => void }) {
  const r = t.repeatDialog;
  const [every, setEvery] = useState<"month" | "quarter" | "year">("month");
  const [first, setFirst] = useState<string | null>(suggested.month);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refused = useRefusedDay(setError);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (refused.stop("repeat-first")) return;
    if (!first) return setError(t.errors.date_invalid);
    setBusy(true);
    const result = await repeatInvoice(doc.id, every, first);
    setBusy(false);
    if (!result.ok) return setError(errorText(t, result.error, result.values));
    onDone(result.value.nextOn);
  }
  return (
    <Dialog open title={r.title} onClose={onClose} labels={t.dialog} dirty={every !== "month" || first !== suggested.month}>
      <form className="form-grid" onSubmit={submit} noValidate>
        <p>{r.body}</p>
        <div className="field-row half">
          <label htmlFor="repeat-every">{r.every}</label>
          <select id="repeat-every" className="field" value={every} onChange={e => { const v = e.target.value as typeof every; setEvery(v); setFirst(suggested[v]); }}>
            {(["month", "quarter", "year"] as const).map(k => <option key={k} value={k}>{r.options[k]}</option>)}
          </select>
        </div>
        <div className="half">
          <DateField id="repeat-first" label={r.first} value={first} onChange={setFirst} onProblem={refused.onProblem} today={today} min={today} required labels={t.date} chips={false} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button quiet" onClick={onClose}>{t.common.cancel}</button>
          <button type="submit" className="button" disabled={busy || !first}>{r.confirm}</button>
        </div>
      </form>
    </Dialog>
  );
}

// A day the kit's DateField refuses as typed (after `max`, before `min`,
// unreadable): the field says why and keeps the text, and the dialog's
// own submit (it reads the day from its state) waits — never the previous
// day in place of what was typed (kit 0.2.4). The problem is told on
// leaving the field, before the click that submits lands.
function useRefusedDay(setError: (update: (error: string | null) => string | null) => void) {
  const problem = useRef<string | null>(null);
  return {
    onProblem(next: string | null) {
      const was = problem.current;
      problem.current = next;
      if (next === null && was !== null) setError(e => (e === was ? null : e));
    },
    stop(fieldId: string): boolean {
      const now = problem.current;
      if (now === null) return false;
      setError(() => now);
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
      return true;
    },
  };
}
