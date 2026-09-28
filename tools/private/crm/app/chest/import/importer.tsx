"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Card, ListIcon, Upload } from "../../../components/icons.tsx";
import { AppError } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import type { ImportReport } from "../../../lib/importers.ts";
import { limits } from "../../../lib/model.ts";
import { fieldsOf, guessMapping, importKinds, mapRow, readTable, type Field, type ImportKind, type Mapping, type Table } from "../../../lib/parse-import.ts";
import { parseVcards, type Card as VCard } from "../../../lib/vcard.ts";
import { importTable, importVcards } from "../actions.ts";

type Picked = { source: "csv"; text: string; table: Table; mapping: Mapping; fileName: string } | { source: "vcf"; text: string; cards: VCard[]; fileName: string };

// Choose what the file holds, pick it, match its columns (guessed from
// HubSpot's, Pipedrive's and French headers), look at the first rows,
// import. The file is read here to show it; the server reads it again.
export function Importer({ locale, t }: { locale: Locale; t: Catalogue }) {
  const w = t.importer;
  const [kind, setKind] = useState<ImportKind>("contacts");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ report: ImportReport; kind: ImportKind } | null>(null);
  const [pending, start] = useTransition();
  const label = (field: Field) => (kind === "deals" && field === "title" ? w.fields.dealTitle : w.fields[field]);

  async function read(source: "csv" | "vcf", file: File) {
    setError(null);
    setReport(null);
    if (file.size > limits.importBytes) return setError(w.tooBig);
    const text = await file.text();
    try {
      if (source === "vcf") setPicked({ source, text, cards: parseVcards(text), fileName: file.name });
      else {
        const table = readTable(text);
        setPicked({ source, text, table, mapping: guessMapping(kind, table.head), fileName: file.name });
      }
    } catch (e) {
      setPicked(null);
      setError(format(t.errors[e instanceof AppError ? e.code : "import_invalid"], e instanceof AppError ? e.values : {}));
    }
  }
  function changeKind(next: ImportKind) {
    setKind(next);
    if (picked?.source === "csv") setPicked({ ...picked, mapping: guessMapping(next, picked.table.head) });
  }
  function submit() {
    if (!picked) return;
    setError(null);
    start(async () => {
      const r = picked.source === "vcf" ? await importVcards(picked.text) : await importTable(kind, picked.text, picked.mapping);
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      setReport({ report: r.value, kind: picked.source === "vcf" ? "contacts" : kind });
      setPicked(null);
    });
  }

  if (report) {
    const r = report.report;
    return (
      <div className="panel report" role="status">
        <p className="strong">{format(w.done, { created: r.created, duplicates: r.duplicates })}</p>
        {r.companies + r.contacts > 0 && <p className="muted">{format(w.doneLinked, { companies: r.companies, contacts: r.contacts })}</p>}
        {r.skipped.length > 0 && (
          <>
            <p>{format(w.skipped, { count: r.skipped.length })}</p>
            <ul className="skipped">{r.skipped.map(s => <li key={s.line} className="num">{format(w.line, { line: s.line, error: format(t.errors[s.error as keyof Catalogue["errors"]] ?? t.errors.invalid, s.values ?? {}) })}</li>)}</ul>
          </>
        )}
        <div className="row">
          <Link prefetch={false} className="button" href={`/chest/${report.kind}`}>{w.open}</Link>
          <button type="button" className="button quiet" onClick={() => setReport(null)}>{w.again}</button>
        </div>
      </div>
    );
  }

  const csv = picked?.source === "csv" ? picked : null;
  const needs = csv ? { companies: ["name"], contacts: ["name", "firstName", "lastName", "email"], deals: ["title"] }[kind].some(f => csv.mapping.includes(f as Field)) : true;
  const preview = csv ? csv.table.rows.slice(0, 5).map(row => mapRow(row, csv.mapping)) : [];
  const shownFields = csv ? (fieldsOf[kind] as readonly Field[]).filter(f => csv.mapping.includes(f)) : [];
  return (
    <div className="importer">
      <div className="sources">
        <section className="source panel">
          <h2><ListIcon />{w.csv}</h2>
          <p className="small-text muted">{w.csvHow}</p>
          <fieldset className="kinds-choice">
            <legend className="label">{w.kind}</legend>
            {importKinds.map(k => (
              <label key={k} className={`chip-button${kind === k ? " on" : ""}`}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => changeKind(k)} className="visually-hidden" />
                {w.kinds[k]}
              </label>
            ))}
          </fieldset>
          <label className="button file-input">
            <Upload />{w.choose}
            <input type="file" accept=".csv,text/csv,.txt" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read("csv", f); }} />
          </label>
        </section>
        <section className="source panel">
          <h2><Card />{w.vcf}</h2>
          <p className="small-text muted">{w.vcfHow}</p>
          <label className="button quiet file-input">
            <Upload />{w.choose}
            <input type="file" accept=".vcf,text/vcard,text/x-vcard" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read("vcf", f); }} />
          </label>
        </section>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {csv && (
        <section className="panel" aria-labelledby="map-title">
          <h2 id="map-title">{w.columns}</h2>
          <p className="muted small-text">{csv.fileName} · {plural(w.rows, csv.table.rows.length, locale)} · {w.columnsHint}</p>
          <div className="table-wrap">
            <table className="table mapping">
              <thead><tr><th scope="col">{w.column}</th><th scope="col">{w.example}</th><th scope="col">{w.field}</th></tr></thead>
              <tbody>
                {csv.table.head.map((h, i) => {
                  const example = csv.table.rows.find(r => (r[i] ?? "").trim() !== "")?.[i] ?? "";
                  return (
                    <tr key={i}>
                      <th scope="row">{h || "—"}</th>
                      <td className="muted example">{example}</td>
                      <td>
                        <label className="visually-hidden" htmlFor={`map-${i}`}>{w.field} {h}</label>
                        <select id={`map-${i}`} className="field compact" value={csv.mapping[i] ?? ""} onChange={e => {
                          const field = e.target.value as Field | "";
                          const mapping = csv.mapping.map((m, j) => (j === i ? field : m === field && field !== "" ? "" : m));
                          setPicked({ ...csv, mapping });
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
          {shownFields.length > 0 && (
            <>
              <h3 className="label-mono">{w.preview}</h3>
              <p className="muted small-text">{w.previewHint}</p>
              <div className="table-wrap">
                <table className="table preview">
                  <thead><tr>{shownFields.map(f => <th key={f} scope="col">{label(f)}</th>)}</tr></thead>
                  <tbody>{preview.map((row, i) => <tr key={i}>{shownFields.map(f => <td key={f}>{row[f] ?? ""}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          {!needs && <p className="error">{w.needs[kind]}</p>}
          <div className="form-actions">
            <button type="button" className="button" disabled={pending || !needs} onClick={submit}><Upload />{pending ? w.importing : `${w.submit} · ${plural(w.rows, csv.table.rows.length, locale)}`}</button>
          </div>
        </section>
      )}
      {picked?.source === "vcf" && (
        <section className="panel" aria-labelledby="vcf-title">
          <h2 id="vcf-title">{w.preview}</h2>
          <p className="muted small-text">{picked.fileName} · {plural(w.cards, picked.cards.length, locale)}</p>
          <div className="table-wrap">
            <table className="table preview">
              <thead><tr><th scope="col">{w.fields.name}</th><th scope="col">{w.fields.email}</th><th scope="col">{w.fields.phone}</th><th scope="col">{w.fields.company}</th></tr></thead>
              <tbody>{picked.cards.slice(0, 5).map((c, i) => <tr key={i}><td>{c.name}</td><td>{c.email}</td><td className="num">{c.phone}</td><td>{c.company}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="button" disabled={pending} onClick={submit}><Upload />{pending ? w.importing : `${w.submit} · ${plural(w.cards, picked.cards.length, locale)}`}</button>
          </div>
        </section>
      )}
    </div>
  );
}
