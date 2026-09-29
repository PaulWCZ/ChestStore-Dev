"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useToast } from "../../../components/toast.tsx";
import { guessDateOrder, guessMapping, importFields, parseCsv, personKey, readDate, type DateOrder, type ImportField, type Mapping } from "../../../lib/csv-read.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { importExpenses } from "../actions.ts";

type Words = Catalogue["settings"]["import"];
const maxBytes = 2 << 20;

// Import past expenses: read the previous tool's CSV here, in the browser;
// guess its columns, let the accountant correct them and see the first
// lines as they will be read; then send the mapped lines.
export function ImportSection({ team, locale, t, errors }: { team: { id: string; name: string }[]; locale: string; t: Words; errors: Catalogue["errors"] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [order, setOrder] = useState<DateOrder>("dmy");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const names = useMemo(() => new Set(team.map(m => personKey(m.name))), [team]);

  async function pick(file: File | undefined) {
    setResult(null);
    setProblem(null);
    if (!file) return;
    if (file.size > maxBytes) return setProblem(t.tooBig);
    const parsed = parseCsv(await file.text(), 2002);
    if (parsed.length < 2) return setProblem(t.empty);
    if (parsed.length > 2001) return setProblem(t.tooBig);
    const guessed = guessMapping(parsed[0]!);
    setRows(parsed);
    setMapping(guessed);
    setOrder(guessed.date !== undefined ? guessDateOrder(parsed.slice(1, 200).map(r => r[guessed.date!] ?? "")) : "dmy");
  }

  const headers = rows?.[0] ?? [];
  const body = rows?.slice(1) ?? [];
  const value = (row: string[], field: ImportField) => (mapping[field] === undefined ? "" : row[mapping[field]!] ?? "").trim();
  const unmatched = body.filter(r => !names.has(personKey(value(r, "person"))));
  const ready = body.length - unmatched.length;

  function run() {
    const lines = body.map(r => Object.fromEntries(importFields.map(f => [f, value(r, f)])));
    start(async () => {
      const answer = await importExpenses(lines, order);
      if (!answer.ok) return void toast(format(errors[answer.error], answer.values ?? {}));
      const { imported, skipped } = answer.value;
      const why = skipped.slice(0, 8).map(s => `${format(t.line, { line: s.line + 1 })} (${s.reason in t.reasons ? t.reasons[s.reason as keyof Words["reasons"]] : errors[s.reason as keyof Catalogue["errors"]] ?? s.reason})`).join(", ");
      setResult([plural(t.done, imported, locale), skipped.length > 0 ? `${plural(t.skipped, skipped.length, locale)}: ${why}${skipped.length > 8 ? "…" : ""}` : ""].filter(Boolean).join(" "));
      toast(plural(t.done, imported, locale));
      setRows(null);
      router.refresh();
    });
  }

  return (
    <section id="import" className="paper" aria-labelledby="import-title">
      <h2 id="import-title">{t.title}</h2>
      <p className="hint">{t.intro}</p>
      <hr className="rule" />
      <div className="form-grid">
        <div className="field-row">
          <label htmlFor="import-file">{t.file}</label>
          <input id="import-file" type="file" accept=".csv,text/csv,text/plain" className="field" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
        </div>
        {problem && <p className="error" role="alert">{problem}</p>}
        {result && <p className="notice info" role="status">{result}</p>}
        {rows && (
          <>
            <fieldset className="import-map" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ marginBottom: 8 }}>{t.columns}</legend>
              {importFields.map(f => (
                <div key={f} className="field-row">
                  <label htmlFor={`map-${f}`}>{t.fields[f]}</label>
                  <select id={`map-${f}`} className="field" value={mapping[f] ?? ""} onChange={e => setMapping(m => ({ ...m, [f]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                    <option value="">{t.none}</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `#${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
              <div className="field-row">
                <label htmlFor="date-order">{t.dateOrder}</label>
                <select id="date-order" className="field" value={order} onChange={e => setOrder(e.target.value as DateOrder)}>
                  <option value="dmy">{t.dmy}</option>
                  <option value="mdy">{t.mdy}</option>
                  <option value="ymd">{t.ymd}</option>
                </select>
              </div>
            </fieldset>
            <div className="table-wrap">
              <table className="grid import-preview">
                <caption className="label" style={{ textAlign: "left", paddingBottom: 6 }}>{t.preview}</caption>
                <thead><tr>{(["date", "person", "amount", "currency", "category", "merchant"] as const).map(f => <th key={f}>{t.fields[f]}</th>)}</tr></thead>
                <tbody>
                  {body.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td className="mono">{readDate(value(r, "date"), order) ?? value(r, "date")}</td>
                      <td className={names.has(personKey(value(r, "person"))) ? undefined : "unmatched"}>{value(r, "person")}</td>
                      <td className="mono">{value(r, "amount")}</td>
                      <td>{value(r, "currency")}</td>
                      <td>{value(r, "category")}</td>
                      <td>{value(r, "merchant")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint" role="status">
              {plural(t.matched, ready, locale)}{" "}
              {unmatched.length > 0 && plural(t.unmatched, unmatched.length, locale, { names: [...new Set(unmatched.map(r => value(r, "person") || "—"))].slice(0, 4).join(", ") })}
            </p>
            <div><button type="button" className="button" disabled={pending || ready === 0} onClick={run}>{plural(t.run, ready, locale)}</button></div>
          </>
        )}
      </div>
    </section>
  );
}
