"use client";

import { useState, useTransition } from "react";
import { Box, People, Upload } from "../../../components/icons.tsx";
import { AppError } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import type { ImportReport } from "../../../lib/importers.ts";
import { fieldsOf, guessMapping, importKinds, importLimits, mapRow, mappingReady, readTable, type Field, type ImportKind, type Mapping, type Table } from "../../../lib/parse-import.ts";
import { importFile } from "../actions.ts";

type Picked = { text: string; table: Table; mapping: Mapping; fileName: string };

// Choose what the file holds, pick it, check the columns (guessed from the
// usual French and English headers), look at the first rows, import. The
// file is read here to show it; the server reads it again.
export function Importer({ t, locale, initialKind, allowed }: { t: Catalogue; locale: Locale; initialKind: ImportKind; allowed: Record<ImportKind, boolean> }) {
  const w = t.importer;
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ report: ImportReport; kind: ImportKind } | null>(null);
  const [pending, start] = useTransition();
  const label = (field: Field) => w.fields[kind][field as keyof (typeof w.fields)[ImportKind]] as string;

  async function read(file: File) {
    setError(null);
    setReport(null);
    if (file.size > importLimits.bytes) return setError(t.errors.import_too_large);
    const text = await file.text();
    try {
      const table = readTable(text);
      setPicked({ text, table, mapping: guessMapping(kind, table.head), fileName: file.name });
    } catch (e) {
      setPicked(null);
      setError(format(t.errors[e instanceof AppError ? e.code : "import_invalid"], e instanceof AppError ? e.values : {}));
    }
  }
  function changeKind(next: ImportKind) {
    setKind(next);
    if (picked) setPicked({ ...picked, mapping: guessMapping(next, picked.table.head) });
  }
  function submit() {
    if (!picked) return;
    setError(null);
    start(async () => {
      const r = await importFile(kind, picked.text, picked.mapping);
      if (!r.ok) return setError(format(t.errors[r.error], r.values ?? {}));
      setReport({ report: r.value, kind });
      setPicked(null);
    });
  }

  if (report) {
    const r = report.report;
    return (
      <section className="panel report" role="status">
        <h2>{format(w.done[report.kind], { created: r.created })}</h2>
        {r.duplicates > 0 && <p className="muted">{plural(w.duplicates, r.duplicates, locale)}</p>}
        {r.skipped.length > 0 && (
          <>
            <p>{plural(w.skipped, r.skipped.length, locale)}</p>
            <ul className="skipped">{r.skipped.map(s => <li key={s.line}>{format(w.line, { line: s.line, error: format(t.errors[s.error as keyof Catalogue["errors"]] ?? t.errors.invalid, s.values ?? {}) })}</li>)}</ul>
          </>
        )}
        <div className="row-actions">
          <a className="button" href={report.kind === "clients" ? "/chest/clients" : "/chest/catalogue"}>{w.open[report.kind]}</a>
          <button type="button" className="button quiet" onClick={() => setReport(null)}>{w.again}</button>
        </div>
      </section>
    );
  }

  const ready = picked ? mappingReady(kind, picked.mapping) : false;
  const shown = picked ? (fieldsOf[kind] as readonly Field[]).filter(f => picked.mapping.includes(f)) : [];
  const preview = picked ? picked.table.rows.slice(0, 5).map(row => mapRow(row, picked.mapping)) : [];
  return (
    <div className="importer">
      <section className="panel" aria-labelledby="source">
        <h2 id="source">{w.what}</h2>
        <fieldset className="choice">
          <legend className="visually-hidden">{w.what}</legend>
          <div className="two-col">
            {importKinds.filter(k => allowed[k]).map(k => (
              <label key={k} className="option">
                <input type="radio" name="kind" checked={kind === k} onChange={() => changeKind(k)} />
                <span>{k === "clients" ? <People /> : <Box />} {w.kinds[k]}</span>
                <span className="sub">{w.kindHints[k]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="hint">{w.how}</p>
        <label className="button file-input">
          <Upload />{picked ? w.another : w.choose}
          <input type="file" accept=".csv,text/csv,.txt,text/plain" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {picked && (
        <section className="panel" aria-labelledby="columns">
          <h2 id="columns">{w.columns}</h2>
          <p className="hint">{picked.fileName} · {plural(w.rows, picked.table.rows.length, locale)} · {w.columnsHint}</p>
          <div className="table-wrap">
            <table className="table mapping">
              <thead><tr><th scope="col">{w.column}</th><th scope="col">{w.example}</th><th scope="col">{w.field}</th></tr></thead>
              <tbody>
                {picked.table.head.map((h, i) => {
                  const example = picked.table.rows.find(r => (r[i] ?? "").trim() !== "")?.[i] ?? "";
                  return (
                    <tr key={i}>
                      <th scope="row">{h || "—"}</th>
                      <td className="muted example">{example}</td>
                      <td>
                        <label className="visually-hidden" htmlFor={`map-${i}`}>{format(w.fieldOf, { column: h })}</label>
                        <select id={`map-${i}`} className="field compact" value={picked.mapping[i] ?? ""} onChange={e => {
                          const field = e.target.value as Field | "";
                          setPicked({ ...picked, mapping: picked.mapping.map((m, j) => (j === i ? field : m === field && field !== "" ? "" : m)) });
                        }}>
                          <option value="">{w.ignore}</option>
                          {(fieldsOf[kind] as readonly Field[]).map(f => <option key={f} value={f}>{label(f)}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown.length > 0 && (
            <>
              <h3 className="preview-title">{w.preview}</h3>
              <p className="hint">{w.previewHint}</p>
              <div className="table-wrap">
                <table className="table preview">
                  <thead><tr>{shown.map(f => <th key={f} scope="col">{label(f)}</th>)}</tr></thead>
                  <tbody>{preview.map((row, i) => <tr key={i}>{shown.map(f => <td key={f}>{row[f] ?? ""}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          {!ready && <p className="error">{w.needs[kind]}</p>}
          <div className="row-actions">
            <button type="button" className="button" disabled={pending || !ready} onClick={submit}><Upload />{pending ? w.importing : format(w.submit, { rows: plural(w.rows, picked.table.rows.length, locale) })}</button>
          </div>
        </section>
      )}
    </div>
  );
}
