"use client";

import { Avatar, DataTable, EmptyState, FilePicker, useToast, type PickedFile } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Card, Check, Send } from "../../../components/icons.tsx";
import { cardDateOrder, cardFields, guessCardMapping, holderKey, readCardLines, type CardField, type CardMapping } from "../../../lib/card-read.ts";
import { parseCsv, type DateOrder } from "../../../lib/csv-read.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { formatMoney } from "../../../lib/money.ts";
import { checkCardLine, importCardStatement, remindCardReceipts, undoCardStatement } from "../actions.ts";

export type CardLine = { id: string; day: string; label: string; amount: string; href: string | null; name: string };
export type CardGroup = { owner: string; name: string; photo: string | null; summary: string; lines: CardLine[] };
type Words = { cards: Catalogue["cards"]; errors: Catalogue["errors"]; files: Catalogue["files"]; table: Catalogue["table"]; importWords: Catalogue["settings"]["import"] };
const maxBytes = 2 << 20;

export function CardsView({ locale, currency, team, waiting, check, statements, t }: {
  locale: string;
  currency: string;
  team: { id: string; name: string }[];
  waiting: CardGroup[];
  check: (CardLine & { reason: string })[];
  statements: { id: string; title: string; sub: string }[];
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const errorText = (r: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => format(t.errors[r.error], r.values ?? {});

  function remind(owner?: string) {
    start(async () => {
      const result = await remindCardReceipts(owner);
      if (!result.ok) return void toast({ text: errorText(result), tone: "error" });
      // A bell item left: "Sent", never an Undo.
      toast({ id: `remind-${owner ?? "all"}`, text: plural(t.cards.reminded, result.value.count, locale), sent: true });
    });
  }

  function checked(line: CardLine) {
    start(async () => {
      const result = await checkCardLine(line.id, true);
      if (!result.ok) return void toast({ text: errorText(result), tone: "error" });
      toast({
        id: `check-${line.id}`,
        text: t.cards.checkedDone,
        undo: async () => {
          const back = await checkCardLine(line.id, false);
          router.refresh();
          return back.ok ? true : errorText(back);
        },
      });
      router.refresh();
    });
  }

  const people = waiting.length;
  return (
    <>
      <StatementImport locale={locale} currency={currency} team={team} t={t} />

      {waiting.length > 0 && (
        <section className="section" aria-labelledby="card-waiting">
          <h2 id="card-waiting"><span>{t.cards.waitingTitle}</span></h2>
          <div className="card-hint">
            <p className="hint">{t.cards.waitingHint}</p>
            {people > 1 && <button type="button" className="button small quiet" disabled={pending} onClick={() => remind()}><Send />{plural(t.cards.remindAll, people, locale)}</button>}
          </div>
          {waiting.map(g => (
            <div key={g.owner} className="paper card-person">
              <div className="person-head">
                <Avatar name={g.name} photo={g.photo} size="m" />
                <div className="grow">
                  <div className="name">{g.name}</div>
                  <div className="hint">{g.summary}</div>
                </div>
                <button type="button" className="button small quiet" disabled={pending} onClick={() => remind(g.owner)}><Send />{t.cards.remind}<span className="visually-hidden"> · {g.name}</span></button>
              </div>
              <hr className="rule" />
              <ul className="rows">
                {g.lines.map(l => (
                  <li key={l.id} className="row">
                    <span className="thumb" aria-hidden="true"><Card /></span>
                    <span className="main"><span className="what">{l.label}</span><span className="sub"><span className="mono">{l.day}</span></span></span>
                    <span className="right"><span className="amount">{l.amount}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {check.length > 0 && (
        <section className="section" aria-labelledby="card-check">
          <h2 id="card-check"><span>{t.cards.checkTitle}</span></h2>
          <div className="paper">
          <ul className="rows">
            {check.map(l => (
              <li key={l.id} className="row file-row">
                <span className="thumb" aria-hidden="true"><Card /></span>
                {l.href
                  ? <a className="main" href={l.href}><span className="what">{l.label}</span><span className="sub"><span className="mono">{l.day}</span><span>{l.name}</span><span>{l.reason}</span></span></a>
                  : <span className="main"><span className="what">{l.label}</span><span className="sub"><span className="mono">{l.day}</span><span>{l.name}</span><span>{l.reason}</span></span></span>}
                <span className="right">
                  <span className="amount">{l.amount}</span>
                  <button type="button" className="button small quiet" disabled={pending} onClick={() => checked(l)}><Check />{t.cards.checked}<span className="visually-hidden">: {l.label}, {l.amount}</span></button>
                </span>
              </li>
            ))}
          </ul>
          </div>
        </section>
      )}

      {statements.length > 0 && (
        <section className="section" aria-labelledby="card-statements">
          <h2 id="card-statements"><span>{t.cards.statementsTitle}</span></h2>
          <ul className="rows">
            {statements.map(s => (
              <li key={s.id} className="row">
                <span className="thumb" aria-hidden="true"><Card /></span>
                <span className="main"><span className="what">{s.title}</span><span className="sub">{s.sub}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {statements.length === 0 && (
        <div className="paper">
          <EmptyState icon={<Card />} title={t.cards.empty.title} body={t.cards.empty.body} />
        </div>
      )}
    </>
  );
}

// Import a statement: the file is read here, in the browser (it never
// leaves as a file); its columns are guessed, the accountant checks them
// and says whose card it is — one person for the file, or a column naming
// each payment's card holder, matched to the team by name. Only the card
// payments go to the server, one line each.
function StatementImport({ locale, currency, team, t }: { locale: string; currency: string; team: { id: string; name: string }[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<CardMapping>({});
  const [order, setOrder] = useState<DateOrder>("dmy");
  const [owner, setOwner] = useState("");
  const [holders, setHolders] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const picked = files[0]?.file ?? null;
  useEffect(() => {
    if (picked) void read(picked);
    else setRows(null);
  }, [picked]);

  async function read(file: File) {
    setProblem(null);
    setResult(null);
    if (file.size > maxBytes) return setProblem(t.importWords.tooBig);
    const parsed = parseCsv(await file.text(), 2002);
    if (parsed.length < 2) return setProblem(t.importWords.empty);
    if (parsed.length > 2001) return setProblem(t.importWords.tooBig);
    const guessed = guessCardMapping(parsed[0]!);
    setRows(parsed);
    setMapping(guessed);
    setOrder(cardDateOrder(parsed.slice(1), guessed));
    setHolders({});
  }

  const headers = rows?.[0] ?? [];
  const body = useMemo(() => rows?.slice(1) ?? [], [rows]);
  const reading = useMemo(() => readCardLines(body, mapping, order, currency), [body, mapping, order, currency]);
  // The card holders the file names, each matched to a person by name
  // until the accountant picks another.
  const byName = useMemo(() => new Map(team.map(m => [holderKey(m.name), m.id])), [team]);
  const names = useMemo(() => mapping.holder === undefined ? [] : [...new Set(reading.lines.map(l => l.holder).filter(Boolean))].slice(0, 50), [reading, mapping.holder]);
  const holderOf = (name: string) => holders[name] ?? byName.get(holderKey(name)) ?? "";
  const memberOf = (l: { holder: string }) => (mapping.holder === undefined ? owner : holderOf(l.holder));
  const ready = reading.lines.filter(l => memberOf(l) !== "");
  const missingColumns = mapping.date === undefined || (mapping.amount === undefined && mapping.debit === undefined);

  function run() {
    const lines = ready.map(l => ({ date: l.date, label: l.label, amount: l.amount, currency: l.currency, member: memberOf(l) }));
    start(async () => {
      const answer = await importCardStatement(picked?.name ?? "", lines);
      if (!answer.ok) return void toast({ text: format(t.errors[answer.error], answer.values ?? {}), tone: "error" });
      const { statement, payments, matched, created, known } = answer.value;
      const text = [
        plural(t.cards.done, payments, locale),
        payments > 0 ? `${plural(t.cards.doneMatched, matched, locale)} ${plural(t.cards.doneCreated, created, locale)}` : "",
        known > 0 ? plural(t.cards.doneKnown, known, locale) : "",
      ].filter(Boolean).join(" ");
      setResult(text);
      // The holders were asked in their bell; Undo takes the statement and
      // its drafts back (the bell items too) while nobody touched them.
      toast({
        id: `statement-${statement}`,
        text,
        undo: async () => {
          const back = await undoCardStatement(statement);
          if (back.ok) setResult(null);
          router.refresh();
          return back.ok ? true : format(t.errors[back.error], back.values ?? {});
        },
      });
      setFiles([]);
      setRows(null);
      router.refresh();
    });
  }

  const label = (f: CardField) => t.cards.fields[f];
  return (
    <section className="paper" aria-labelledby="card-import">
      <h2 id="card-import" className="section-title"><Card />{t.cards.importTitle}</h2>
      <p className="hint">{t.cards.importIntro}</p>
      <hr className="rule" />
      <div className="form-grid">
        <div className="field-row">
          <span className="field-label" aria-hidden="true">{t.cards.file}</span>
          <FilePicker label={t.cards.file} files={files} onChange={setFiles} maxFiles={1} maxSize={maxBytes} accept={[".csv", "text/csv", "text/plain"]} labels={t.files} />
        </div>
        {problem && <p className="error" role="alert">{problem}</p>}
        {result && <p className="notice info" role="status">{result}</p>}
        {rows && (
          <>
            <fieldset className="import-map">
              <legend className="field-label">{t.importWords.columns}</legend>
              {cardFields.map(f => (
                <div key={f} className="field-row">
                  <label htmlFor={`card-map-${f}`}>{label(f)}</label>
                  <select id={`card-map-${f}`} className="field" value={mapping[f] ?? ""} onChange={e => setMapping(m => ({ ...m, [f]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                    <option value="">{t.importWords.none}</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
              <div className="field-row">
                <label htmlFor="card-date-order">{t.importWords.dateOrder}</label>
                <select id="card-date-order" className="field" value={order} onChange={e => setOrder(e.target.value as DateOrder)}>
                  <option value="dmy">{t.importWords.dmy}</option>
                  <option value="mdy">{t.importWords.mdy}</option>
                  <option value="ymd">{t.importWords.ymd}</option>
                </select>
              </div>
            </fieldset>
            <p className="hint">{t.cards.amountHint}</p>
            {mapping.holder === undefined
              ? (
                <div className="field-row">
                  <label htmlFor="card-owner">{t.cards.owner}</label>
                  <select id="card-owner" className="field" value={owner} onChange={e => setOwner(e.target.value)}>
                    <option value="">—</option>
                    {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )
              : names.length > 0 && (
                <fieldset className="import-map">
                  <legend className="field-label">{t.cards.holders}</legend>
                  {names.map((n, i) => (
                    <div key={n} className="field-row">
                      <label htmlFor={`card-holder-${i}`}>{n}</label>
                      <select id={`card-holder-${i}`} className="field" value={holderOf(n)} onChange={e => setHolders(h => ({ ...h, [n]: e.target.value }))}>
                        <option value="">{t.cards.nobody}</option>
                        {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                  ))}
                </fieldset>
              )}
            {!missingColumns && (
              <div className="import-preview">
                <DataTable
                  caption={t.cards.preview}
                  showCaption
                  rows={reading.lines.slice(0, 5)}
                  rowKey={l => String(l.row)}
                  labels={t.table}
                  columns={[
                    { key: "date", label: label("date"), render: l => <span className="mono">{l.date.split("-").reverse().join("/")}</span> },
                    { key: "label", label: label("label"), rowHeader: true, render: l => l.label || "—" },
                    { key: "amount", label: t.cards.spent, align: "end", render: l => <span className="mono">{formatMoney(l.amount, l.currency, locale)}</span> },
                    { key: "holder", label: label("holder"), render: l => team.find(m => m.id === memberOf(l))?.name ?? <span className="unmatched">{l.holder || "—"}</span> },
                  ]}
                />
              </div>
            )}
            <p className="hint" role="status">
              {missingColumns
                ? t.cards.needColumns
                : [
                  plural(t.cards.found, reading.lines.length, locale),
                  reading.refunds > 0 ? plural(t.cards.refunds, reading.refunds, locale) : "",
                  reading.unreadable.length > 0 ? plural(t.cards.unreadable, reading.unreadable.length, locale, { lines: reading.unreadable.slice(0, 6).map(n => n + 1).join(", ") }) : "",
                  reading.lines.length > ready.length ? plural(t.cards.noHolder, reading.lines.length - ready.length, locale) : "",
                ].filter(Boolean).join(" ")}
            </p>
            <div><button type="button" className="button" disabled={pending || missingColumns || ready.length === 0} onClick={run}>{plural(t.cards.run, ready.length || reading.lines.length, locale)}</button></div>
          </>
        )}
      </div>
    </section>
  );
}
