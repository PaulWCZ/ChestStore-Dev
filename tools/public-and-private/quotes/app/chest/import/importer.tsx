"use client";

import { DataTable, FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { Box, Invoice, People, Upload } from "../../../components/icons.tsx";
import { AppError } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";
import type { ImportReport } from "../../../lib/importers.ts";
import { fieldsOf, guessMapping, importKinds, importLimits, mapRow, mappingReady, readTable, type Field, type ImportKind, type Mapped, type Mapping, type Table } from "../../../lib/parse-import.ts";
import { importFile, undoImport } from "../actions.ts";

type Picked = { text: string; table: Table; mapping: Mapping; fileName: string };

// Choose what the file holds, pick it, check the columns (guessed from the
// usual French and English headers), look at the first rows, import. The
// file is read here to show it; the server reads it again.
export function Importer({ t, locale, initialKind, allowed }: { t: Catalogue; locale: Locale; initialKind: ImportKind; allowed: Record<ImportKind, boolean> }) {
  const w = t.importer;
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ report: ImportReport; kind: ImportKind } | null>(null);
  const [pending, start] = useTransition();
  const [undone, setUndone] = useState<number | null>(null);
  const label = (field: Field) => w.fields[kind][field as keyof (typeof w.fields)[ImportKind]] as string;

  async function read(file: File) {
    setError(null);
    setReport(null);
    const text = await file.text();
    try {
      const table = readTable(text);
      setPicked({ text, table, mapping: guessMapping(kind, table.head), fileName: file.name });
    } catch (e) {
      setPicked(null);
      setError(format(t.errors[e instanceof AppError ? e.code : "import_invalid"], e instanceof AppError ? e.values : {}));
    }
  }
  // The file stays in this browser (the kit's picker, without upload): it
  // is read here to show it, and sent as text when imported. Taking it
  // away (×) lets another be chosen.
  function onFiles(update: (current: readonly PickedFile[]) => PickedFile[]) {
    const next = update(files);
    setFiles(next);
    const added = next.find(f => !files.some(x => x.key === f.key));
    if (added?.file) void read(added.file);
    if (next.length === 0) { setPicked(null); setError(null); }
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
      setUndone(null);
      setPicked(null);
      setFiles([]);
    });
  }

  if (report && undone !== null) {
    return (
      <section className="panel report" role="status">
        <h2>{plural(w.undone, undone, locale)}</h2>
        <div className="row-actions">
          <button type="button" className="button" onClick={() => { setReport(null); setUndone(null); }}>{w.again}</button>
        </div>
      </section>
    );
  }
  if (report) {
    const r = report.report;
    const batch = r.batch;
    return (
      <section className="panel report" role="status">
        <h2>{format(w.done[report.kind], { created: r.created })}</h2>
        {report.kind === "invoices" && r.created > 0 && <p>{w.importedNote}</p>}
        {(r.clients ?? 0) > 0 && <p className="muted">{plural(w.clientsAdded, r.clients ?? 0, locale)}</p>}
        {(r.paid ?? 0) > 0 && <p className="muted">{plural(w.alreadyPaid, r.paid ?? 0, locale)}</p>}
        {r.duplicates > 0 && <p className="muted">{plural(w.duplicates, r.duplicates, locale)}</p>}
        {r.skipped.length > 0 && (
          <>
            <p>{plural(w.skipped, r.skipped.length, locale)}</p>
            <ul className="skipped">{r.skipped.map(s => <li key={s.line}>{format(w.line, { line: s.line, error: format(t.errors[s.error as keyof Catalogue["errors"]] ?? t.errors.invalid, s.values ?? {}) })}</li>)}</ul>
          </>
        )}
        <div className="row-actions">
          <a className="button" href={report.kind === "clients" ? "/chest/clients" : report.kind === "items" ? "/chest/catalogue" : "/chest/invoices?state=open"}>{w.open[report.kind]}</a>
          <button type="button" className="button quiet" onClick={() => setReport(null)}>{w.again}</button>
          {batch && r.created > 0 && (
            <button type="button" className="link-button" disabled={pending} onClick={() => start(async () => {
              const back = await undoImport(batch);
              if (!back.ok) return setError(format(t.errors[back.error], back.values ?? {}));
              setUndone(back.value.removed);
            })}>{w.undo}</button>
          )}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
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
          <div className="kind-options">
            {importKinds.filter(k => allowed[k]).map(k => (
              <label key={k} className="option">
                <input type="radio" name="kind" checked={kind === k} onChange={() => changeKind(k)} />
                <span>{k === "clients" ? <People /> : k === "items" ? <Box /> : <Invoice />} {w.kinds[k]}</span>
                <span className="sub">{w.kindHints[k]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="hint">{kind === "invoices" ? w.howInvoices : w.how}</p>
        <FilePicker label={w.file} files={files} onChange={onFiles} maxFiles={1} maxSize={importLimits.bytes} accept={[".csv", "text/csv", ".txt", "text/plain"]} labels={{ ...t.files, addOne: w.choose }} />
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {picked && (
        <section className="panel" aria-labelledby="columns">
          <h2 id="columns">{w.columns}</h2>
          <p className="hint">{picked.fileName} · {plural(w.rows, picked.table.rows.length, locale)} · {w.columnsHint}</p>
          <div className="mapping compact-table">
            <DataTable
              caption={w.columns}
              labels={t.table}
              rows={picked.table.head.map((h, i) => ({ i, h, example: picked.table.rows.find(r => (r[i] ?? "").trim() !== "")?.[i] ?? "" }))}
              rowKey={r => String(r.i)}
              columns={[
                { key: "column", label: w.column, rowHeader: true, render: r => r.h || "—" },
                { key: "example", label: w.example, hideOnPhone: true, render: r => <span className="example">{r.example}</span> },
                { key: "field", label: w.field, render: r => (
                  <>
                    <label className="visually-hidden" htmlFor={`map-${r.i}`}>{format(w.fieldOf, { column: r.h })}</label>
                    <select id={`map-${r.i}`} className="field compact" value={picked.mapping[r.i] ?? ""} onChange={e => {
                      const field = e.target.value as Field | "";
                      setPicked({ ...picked, mapping: picked.mapping.map((m, j) => (j === r.i ? field : m === field && field !== "" ? "" : m)) });
                    }}>
                      <option value="">{w.ignore}</option>
                      {(fieldsOf[kind] as readonly Field[]).map(f => <option key={f} value={f}>{label(f)}</option>)}
                    </select>
                  </>
                ) },
              ]}
            />
          </div>
          {shown.length > 0 && (
            <>
              <h3 className="preview-title">{w.preview}</h3>
              <p className="hint">{w.previewHint}</p>
              <div className="preview compact-table">
                <DataTable
                  caption={w.preview}
                  labels={t.table}
                  rows={preview.map((row, i) => ({ i, row }))}
                  rowKey={r => String(r.i)}
                  columns={shown.map(f => ({ key: f, label: label(f), render: (r: { row: Mapped }) => <span className="cut">{r.row[f] ?? ""}</span> }))}
                />
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
