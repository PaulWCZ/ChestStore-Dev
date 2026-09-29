"use client";

import { DataTable, FilePicker, useToast, type PickedFile } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { Check, Coins, Upload } from "../../../components/icons.tsx";
import { AppError } from "../../../lib/app-error.ts";
import { bankFields, bankLimits, bankMappingReady, decodeStatement, guessBankMapping, readStatement, type BankField, type BankMapping, type Statement } from "../../../lib/bank-parse.ts";
import type { Proposal, Reading } from "../../../lib/bank.ts";
import { format, formatDay, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import { formatMoney } from "../../../lib/money.ts";
import { readBank, recordBank, removePayment } from "../actions.ts";

type Picked = { text: string; statement: Statement; mapping: BankMapping; fileName: string };

// Pick the statement (read here: UTF-8 or the Latin-1 many banks write),
// check the columns when they were not all recognised, then each payment
// received comes with the invoice it pays: one tap records it (Undo takes
// it back), or another invoice is chosen. Nothing is recorded by itself.
export function BankView({ t, locale, currency }: { t: Catalogue; locale: Locale; currency: string }) {
  const w = t.bank;
  const toast = useToast();
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const errorText = (code: string, values?: Record<string, number | string>) => format(t.errors[code as keyof Catalogue["errors"]] ?? t.errors.unknown, values ?? {});

  function find(p: Picked) {
    setError(null);
    start(async () => {
      const r = await readBank(p.text, p.mapping);
      if (!r.ok) return setError(errorText(r.error, r.values));
      setReading(r.value);
    });
  }
  async function read(file: File) {
    setError(null);
    setReading(null);
    try {
      const text = decodeStatement(new Uint8Array(await file.arrayBuffer()));
      const statement = readStatement(text);
      const p = { text, statement, mapping: guessBankMapping(statement.head), fileName: file.name };
      setPicked(p);
      // Every column needed was recognised: straight to the payments.
      if (bankMappingReady(p.mapping)) find(p);
    } catch (e) {
      setPicked(null);
      setError(errorText(e instanceof AppError ? e.code : "import_invalid", e instanceof AppError ? e.values : {}));
    }
  }
  function onFiles(update: (current: readonly PickedFile[]) => PickedFile[]) {
    const next = update(files);
    setFiles(next);
    const added = next.find(f => !files.some(x => x.key === f.key));
    if (added?.file) void read(added.file);
    if (next.length === 0) { setPicked(null); setReading(null); setError(null); }
  }
  function again() {
    setFiles([]);
    setPicked(null);
    setReading(null);
    setError(null);
  }

  return (
    <div className="importer bank">
      <section className="panel" aria-labelledby="statement">
        <h2 id="statement">{w.file}</h2>
        <p className="hint">{w.how}</p>
        <FilePicker label={w.file} files={files} onChange={onFiles} maxFiles={1} maxSize={bankLimits.bytes} accept={[".csv", "text/csv", ".txt", "text/plain"]} labels={{ ...t.files, addOne: w.choose }} />
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {picked && !reading && (
        <section className="panel" aria-labelledby="bank-columns">
          <h2 id="bank-columns">{w.columns}</h2>
          <p className="hint">{picked.fileName} · {w.columnsHint}</p>
          <div className="mapping compact-table">
            <DataTable
              caption={w.columns}
              labels={t.table}
              rows={picked.statement.head.map((h, i) => ({ i, h, example: picked.statement.rows.find(r => (r[i] ?? "").trim() !== "")?.[i] ?? "" }))}
              rowKey={r => String(r.i)}
              columns={[
                { key: "column", label: t.importer.column, rowHeader: true, render: r => r.h || "—" },
                { key: "example", label: t.importer.example, hideOnPhone: true, render: r => <span className="example">{r.example}</span> },
                { key: "field", label: t.importer.field, render: r => (
                  <>
                    <label className="visually-hidden" htmlFor={`bank-map-${r.i}`}>{format(t.importer.fieldOf, { column: r.h })}</label>
                    <select id={`bank-map-${r.i}`} className="field compact" value={picked.mapping[r.i] ?? ""} onChange={e => {
                      const field = e.target.value as BankField | "";
                      setPicked({ ...picked, mapping: picked.mapping.map((m, j) => (j === r.i ? field : m === field && field !== "" ? "" : m)) });
                    }}>
                      <option value="">{t.importer.ignore}</option>
                      {bankFields.map(f => <option key={f} value={f}>{w.fields[f]}</option>)}
                    </select>
                  </>
                ) },
              ]}
            />
          </div>
          {!bankMappingReady(picked.mapping) && <p className="error">{w.needs}</p>}
          <div className="row-actions">
            <button type="button" className="button" disabled={pending || !bankMappingReady(picked.mapping)} onClick={() => find(picked)}><Upload />{pending ? w.reading : w.read}</button>
          </div>
        </section>
      )}

      {reading && (
        <section className="panel" aria-labelledby="bank-found">
          <h2 id="bank-found">{plural(w.summary, reading.proposals.length, locale)}</h2>
          {reading.recorded > 0 && <p className="muted">{plural(w.recordedBefore, reading.recorded, locale)}</p>}
          {reading.outgoing > 0 && <p className="muted">{plural(w.outgoing, reading.outgoing, locale)}</p>}
          {reading.open.length === 0 && reading.proposals.length > 0 && <p className="muted">{w.nothingOpen}</p>}
          {reading.problems.length > 0 && (
            <>
              <p>{plural(w.problems, reading.problems.length, locale)}</p>
              <ul className="skipped">{reading.problems.map(p => <li key={p.line}>{format(w.line, { line: p.line, error: errorText(p.error) })}</li>)}</ul>
            </>
          )}
          <ul className="bank-lines">
            {reading.proposals.map(p => <BankLineRow key={p.key} p={p} reading={reading} t={t} locale={locale} money={money} errorText={errorText} toast={toast} />)}
          </ul>
          <div className="row-actions">
            <button type="button" className="button quiet" onClick={again}>{w.another}</button>
          </div>
        </section>
      )}
    </div>
  );
}

// One payment received: the invoice it pays (or a choice), and one tap to
// record it. Recorded, it says so; Undo deletes the payment.
function BankLineRow({ p, reading, t, locale, money, errorText, toast }: {
  p: Proposal; reading: Reading; t: Catalogue; locale: Locale; money: (minor: number) => string;
  errorText: (code: string, values?: Record<string, number | string>) => string; toast: ReturnType<typeof useToast>;
}) {
  const w = t.bank;
  const [choice, setChoice] = useState(p.match?.invoiceId ?? "");
  const [picking, setPicking] = useState(!p.match);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invoice = reading.open.find(o => o.id === choice) ?? null;
  const fits = reading.open.filter(o => o.due >= p.amount || o.id === p.match?.invoiceId);
  async function record() {
    if (!invoice || busy) return;
    setBusy(true);
    const r = await recordBank({ key: p.key, invoiceId: invoice.id, date: p.date, amount: p.amount, label: [p.label, p.reference].filter(Boolean).join(" · ") });
    setBusy(false);
    if (!r.ok) return toast({ text: errorText(r.error, r.values), tone: "error" });
    const paymentId = r.value.id;
    setDone(paymentId);
    toast({
      id: `bank-${p.key}`,
      text: format(w.recordedToast, { amount: money(p.amount), number: invoice.number }),
      undo: async () => { const back = await removePayment(paymentId); if (back.ok) setDone(null); return back.ok || errorText(back.error, back.values); },
    });
  }
  const id = `bank-line-${p.key}`;
  return (
    <li className={done ? "bank-line done" : "bank-line"} aria-labelledby={id}>
      <div className="bank-what">
        <p id={id}><b className="num">{money(p.amount)}</b> <span className="when">{formatDay(p.date, locale)}</span></p>
        <p className="bank-words">{p.label}{p.reference ? <span className="hint"> · {p.reference}</span> : null}</p>
      </div>
      <div className="bank-match">
        {done ? (
          <p className="ok-line"><Check />{w.recorded} · {invoice?.number}</p>
        ) : (
          <>
            {p.match && !picking && invoice ? (
              <>
                <p><strong>{format(w.matched, { number: invoice.number, client: invoice.client })}</strong></p>
                <p className="hint">{w.reasons[p.match.reason]} · {format(w.left, { amount: money(invoice.due) })}</p>
              </>
            ) : (
              <>
                {!p.match && <p className="hint">{w.noMatch}</p>}
                <label className="visually-hidden" htmlFor={`${id}-choice`}>{w.choice}</label>
                <select id={`${id}-choice`} className="field compact" value={choice} onChange={e => setChoice(e.target.value)}>
                  <option value="">{w.choiceNone}</option>
                  {fits.map(o => <option key={o.id} value={o.id}>{o.number} · {o.client} · {money(o.due)}</option>)}
                </select>
              </>
            )}
            <div className="row-actions">
              <button type="button" className="button small" disabled={!invoice || busy} onClick={() => void record()}><Coins />{w.record}</button>
              {p.match && !picking && <button type="button" className="link-button" onClick={() => setPicking(true)}>{w.other}</button>}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
