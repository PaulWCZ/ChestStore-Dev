import { call, toast } from "@argentic/chest-app/client";
import { Confirm, DataTable, FilePicker, Segmented, type PickedFile } from "@argentic/chest-ui/components";
import { useEffect, useState, useTransition } from "react";
import { format, plural } from "../i18n/format.ts";
import type { Locale } from "../i18n/index.ts";
import type { ImportReport } from "../lib/importers.ts";
import { AppError } from "../shared/app-error.ts";
import type { FieldDef, FieldObject } from "../shared/custom.ts";
import { limits } from "../shared/model.ts";
import { fieldsOf, guessMapping, importKinds, mapRow, ownersIn, readTable, type Field, type ImportKind, type Mapped, type Mapping, type Table, type Target } from "../shared/parse-import.ts";
import { parseVcards, type Card as VCard } from "../shared/vcard.ts";
import { Card, ListIcon, Note, Undo, Upload } from "./icons.tsx";
import { OwnerPicker, type OwnerWords } from "./owner-select.tsx";
import type { Teammate, Words } from "./shared.ts";

export type ImportWords = OwnerWords & Words<"importer" | "errors" | "files" | "table">;

type Picked = { source: "csv"; text: string; table: Table; mapping: Mapping; fileName: string } | { source: "vcf"; text: string; cards: VCard[]; fileName: string };
type Props = { locale: Locale; fields: Record<FieldObject, FieldDef[]>; team: Teammate[]; me: string; canAssign: boolean; mayCreateFields: boolean; people: Record<string, string>; t: ImportWords };

// Choose what the file holds, pick it, match its columns (guessed from
// HubSpot's, Pipedrive's and French headers; what is not known goes to the
// notes unless left aside), say who receives the rows of owners who are not
// in the team, look at the first rows, import — and undo it for a day if
// it went wrong. The file is read here to show it; the server reads it again.
export function Importer({ locale, fields, team, me, canAssign, mayCreateFields, people, t }: Props) {
  const w = t.importer;
  const [kind, setKind] = useState<ImportKind>("contacts");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ report: ImportReport; kind: ImportKind } | null>(null);
  const [fillEmpty, setFillEmpty] = useState(false);
  const [unknown, setUnknown] = useState<{ name: string; rows: number }[]>([]);
  const [fallback, setFallback] = useState<string | null>(me);
  const [undoing, setUndoing] = useState(false);
  // The file chosen, in the kit's FilePicker (one per source): it stays in
  // the browser, read here to show it; the server reads it again.
  const [files, setFiles] = useState<{ csv: readonly PickedFile[]; vcf: readonly PickedFile[] }>({ csv: [], vcf: [] });
  const [pending, start] = useTransition();
  const custom = (k: ImportKind) => (k === "activities" ? [] : fields[k]);
  const label = (field: Field) => (kind === "deals" && field === "title" ? w.fields.dealTitle : w.fields[field]);
  const csv = picked?.source === "csv" ? picked : null;

  // The owners the file names who are not in the team: asked once the
  // owner column is known.
  const ownerColumn = csv ? csv.mapping.indexOf("owner") : -1;
  useEffect(() => {
    if (!csv || ownerColumn < 0) return setUnknown([]);
    const named = ownersIn(csv.table, csv.mapping);
    if (named.length === 0) return setUnknown([]);
    let live = true;
    void call("importOwners", { names: named.map(n => n.name) }, { refresh: false, quiet: true }).then(r => { if (live && r.ok) setUnknown(named.filter(n => r.value.includes(n.name))); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csv?.text, ownerColumn]);

  function choose(source: "csv" | "vcf", update: (current: readonly PickedFile[]) => PickedFile[]) {
    const next = update(files[source]);
    const file = next[next.length - 1]?.file ?? null;
    const before = files[source][files[source].length - 1]?.file ?? null;
    // One file at a time: the newest one, from either source.
    setFiles({ csv: source === "csv" ? next.slice(-1) : [], vcf: source === "vcf" ? next.slice(-1) : [] });
    if (!file) {
      setPicked(null);
      setError(null);
    } else if (file !== before) void read(source, file);
  }
  async function read(source: "csv" | "vcf", file: File) {
    setError(null);
    setReport(null);
    if (file.size > limits.importBytes) return setError(w.tooBig);
    const text = await file.text();
    try {
      if (source === "vcf") setPicked({ source, text, cards: parseVcards(text), fileName: file.name });
      else {
        const table = readTable(text);
        setPicked({ source, text, table, mapping: guessMapping(kind, table.head, custom(kind)), fileName: file.name });
      }
    } catch (e) {
      setPicked(null);
      const code = e instanceof AppError ? e.code : "import_invalid";
      setError(format(t.errors[code as keyof typeof t.errors] ?? t.errors.import_invalid, e instanceof AppError ? e.values : {}));
    }
  }
  function changeKind(next: ImportKind) {
    setKind(next);
    if (picked?.source === "csv") setPicked({ ...picked, mapping: guessMapping(next, picked.table.head, custom(next)) });
  }
  function submit() {
    if (!picked) return;
    setError(null);
    const options = { fileName: picked.fileName, ownerFallback: fallback === null ? "none" : fallback === me ? "me" : fallback, fillEmpty };
    start(async () => {
      const r = picked.source === "vcf" ? await call("importVcards", { text: picked.text, ...options }, { quiet: true }) : await call("importTable", { kind, text: picked.text, mapping: picked.mapping, ...options }, { quiet: true });
      if (!r.ok) return setError(r.message);
      setReport({ report: r.value, kind: picked.source === "vcf" ? "contacts" : kind });
      setPicked(null);
      setFiles({ csv: [], vcf: [] });
    });
  }

  if (report) {
    const r = report.report;
    const receiver = r.ownerFallback === null ? w.nobody : r.ownerFallback === me ? t.people.you : people[r.ownerFallback] ?? t.people.unknown;
    return (
      <div className="panel report-panel" role="status">
        <p className="strong">{format(w.done, { created: r.created, duplicates: r.duplicates })}</p>
        {r.duplicates > 0 && (r.updated > 0 ? <p>{plural(w.updated, r.updated, locale)}</p> : <p className="muted">{w.keptAsWas}</p>)}
        {r.companies > 0 && <p className="muted">{plural(w.alsoCompanies, r.companies, locale)}</p>}
        {r.contacts > 0 && <p className="muted">{plural(w.alsoContacts, r.contacts, locale)}</p>}
        {r.steps > 0 && <p>{plural(w.stepsMade, r.steps, locale)}</p>}
        {r.kept.length > 0 && <p><Note />{format(w.keptColumns, { columns: r.kept.join(", ") })}</p>}
        {r.fields.length > 0 && <p>{format(w.newFields, { fields: r.fields.join(", ") })}</p>}
        {r.owners.length > 0 && <p className="notice warn">{format(w.ownersReport, { who: receiver, names: r.owners.map(o => `${o.name} (${plural(w.rows, o.rows, locale)})`).join(", ") })}</p>}
        {r.skipped.length > 0 && (
          <>
            <p>{plural(w.skipped, r.skipped.length, locale)}</p>
            <ul className="skipped">{r.skipped.map(s => <li key={s.line}>{format(w.line, { line: s.line, error: s.values?.["field"] ? format(t.common.fieldError, { field: String(s.values["field"]), error: format(t.errors[s.error as keyof typeof t.errors] ?? t.errors.invalid, s.values) }) : format(t.errors[s.error as keyof typeof t.errors] ?? t.errors.invalid, s.values ?? {}) })}</li>)}</ul>
          </>
        )}
        <div className="row">
          <a className="button" href={`/chest/${report.kind === "activities" ? "" : report.kind}`}>{w.open}</a>
          {r.importId && <button type="button" className="button quiet" onClick={() => setUndoing(true)}><Undo />{w.undo}</button>}
          <button type="button" className="button quiet" onClick={() => setReport(null)}>{w.again}</button>
        </div>
        {undoing && r.importId && <UndoDialog id={r.importId} onClose={() => setUndoing(false)} onDone={() => { setUndoing(false); setReport(null); }} locale={locale} t={t} />}
      </div>
    );
  }

  const needs = csv ? { companies: ["name"], contacts: ["name", "firstName", "lastName", "email"], deals: ["title"], activities: ["deal", "contact", "contactEmail", "company"] }[kind].some(f => csv.mapping.includes(f as Field)) : true;
  const preview = csv ? csv.table.rows.slice(0, 5).map(row => mapRow(row, csv.mapping, csv.table.head)) : [];
  const shownFields = csv ? (fieldsOf[kind] as readonly Field[]).filter(f => csv.mapping.includes(f)) : [];
  const own = custom(kind);
  const setTarget = (i: number, target: Target) => {
    if (!csv) return;
    const unique = target !== "" && target !== "keep" && target !== "new";
    setPicked({ ...csv, mapping: csv.mapping.map((m, j) => (j === i ? target : unique && m === target ? "keep" : m)) });
  };
  return (
    <div className="importer">
      <div className="sources">
        <section className="source panel">
          <h2><ListIcon />{w.csv}</h2>
          <Segmented label={w.kind} hideLabel={false} name="kind" value={kind} onChange={changeKind} options={importKinds.map(k => ({ value: k, label: w.kinds[k] }))} />
          <p className="small-text muted">{kind === "activities" ? w.activitiesHow : w.csvHow}</p>
          <FilePicker label={w.csv} files={files.csv} onChange={update => choose("csv", update)} maxFiles={1} maxSize={limits.importBytes} accept={[".csv", ".txt"]} labels={t.files} />
        </section>
        <section className="source panel">
          <h2><Card />{w.vcf}</h2>
          <p className="small-text muted">{w.vcfHow}</p>
          <FilePicker label={w.vcf} files={files.vcf} onChange={update => choose("vcf", update)} maxFiles={1} maxSize={limits.importBytes} accept={[".vcf"]} labels={t.files} />
        </section>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {csv && (
        <section className="panel" aria-labelledby="map-title">
          <h2 id="map-title">{w.columns}</h2>
          <p className="muted small-text">{csv.fileName} · {plural(w.rows, csv.table.rows.length, locale)} · {w.columnsHint}</p>
          <div className="mapping">
            <DataTable caption={w.columns} labels={t.table} rows={csv.table.head.map((h, i) => ({ i, h, example: csv.table.rows.find(r => (r[i] ?? "").trim() !== "")?.[i] ?? "" }))} rowKey={r => String(r.i)}
              columns={[
                { key: "column", label: w.column, rowHeader: true, render: r => r.h || "—" },
                { key: "example", label: w.example, render: r => <span className="muted example">{r.example}</span> },
                { key: "field", label: w.field, render: ({ i, h }) => (
                      <>
                        <label className="visually-hidden" htmlFor={`map-${i}`}>{w.field} {h}</label>
                        <select id={`map-${i}`} className="field compact" value={csv.mapping[i] ?? ""} onChange={e => setTarget(i, e.target.value as Target)}>
                          <option value="">{w.ignore}</option>
                          <option value="keep">{w.keep}</option>
                          <optgroup label={w.optionsKnown}>
                            {(fieldsOf[kind] as readonly Field[]).map(f => <option key={f} value={f}>{label(f)}</option>)}
                          </optgroup>
                          {own.length > 0 && (
                            <optgroup label={w.optionsOwn}>
                              {own.map(f => <option key={f.id} value={`custom:${f.id}`}>{format(w.customField, { label: f.label })}</option>)}
                            </optgroup>
                          )}
                          {mayCreateFields && kind !== "activities" && <option value="new">{w.newField}</option>}
                        </select>
                      </>
                ) },
              ]} />
          </div>
          {shownFields.length > 0 && (
            <>
              <h3 className="label-mono">{w.preview}</h3>
              <p className="muted small-text">{w.previewHint}</p>
              <div className="preview">
                <DataTable caption={w.preview} labels={t.table} rows={preview.map((row, i) => ({ i, row }))} rowKey={r => String(r.i)}
                  columns={shownFields.map(f => ({ key: f, label: label(f), render: (r: { row: Mapped }) => String(r.row[f] ?? "") }))} />
              </div>
            </>
          )}
          {unknown.length > 0 && (
            <div className="notice warn owners-check">
              <p className="strong">{w.ownersTitle}</p>
              <p>{plural(w.ownersBody, unknown.length, locale, { names: unknown.map(o => `${o.name} (${plural(w.rows, o.rows, locale)})`).join(", ") })}</p>
              <p className="row">
                <OwnerPicker id="owner-fallback" label={w.ownersGive} value={fallback} team={team} me={me} canAssign={canAssign} onChange={setFallback} t={t} />
              </p>
            </div>
          )}
          {kind !== "deals" && kind !== "activities" && <FillEmpty checked={fillEmpty} onChange={setFillEmpty} t={t} />}
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
          <div className="preview">
            <DataTable caption={w.preview} labels={t.table} rows={picked.cards.slice(0, 5).map((c, i) => ({ i, c }))} rowKey={r => String(r.i)}
              columns={[
                { key: "name", label: w.fields.name, render: r => r.c.name },
                { key: "email", label: w.fields.email, render: r => r.c.email },
                { key: "phone", label: w.fields.phone, render: r => <span className="num">{r.c.phone}</span> },
                { key: "company", label: w.fields.company, render: r => r.c.company },
              ]} />
          </div>
          <FillEmpty checked={fillEmpty} onChange={setFillEmpty} t={t} />
          <div className="form-actions">
            <button type="button" className="button" disabled={pending} onClick={submit}><Upload />{pending ? w.importing : `${w.submit} · ${plural(w.cards, picked.cards.length, locale)}`}</button>
          </div>
        </section>
      )}
    </div>
  );
}

function FillEmpty({ checked, onChange, t }: { checked: boolean; onChange: (value: boolean) => void; t: ImportWords }) {
  return (
    <label className="check-label fill-empty">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{t.importer.fillEmpty} <span className="hint">{t.importer.fillEmptyHint}</span></span>
    </label>
  );
}

// Taking an import back: it deletes what the import added, for good, so it
// asks once (the kit's Confirm), then says how much went.
export function UndoDialog({ id, onClose, onDone, locale, t }: { id: string; onClose: () => void; onDone: () => void; locale: Locale; t: ImportWords }) {
  const [pending, start] = useTransition();
    return (
    <Confirm open title={t.importer.undoTitle} body={t.importer.undoBody} confirmLabel={t.importer.undo} cancelLabel={t.common.cancel} busy={pending} onCancel={onClose}
      onConfirm={() => start(async () => {
        const r = await call("undoImport", { id });
        if (!r.ok) return;
        toast(plural(t.importer.undone, r.value.removed, locale));
        onDone();
      })} />
  );
}

// The imports of the last 30 days; those of the last day can be undone.
export function RecentImports({ lines, locale, t }: { lines: { id: string; line: string; count: number; undone: boolean; undoable: boolean }[]; locale: Locale; t: ImportWords }) {
  const [undoing, setUndoing] = useState<string | null>(null);
  if (lines.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="recent-title">
      <h2 id="recent-title" className="label-mono">{t.importer.recent}</h2>
      <ul className="mini-list">
        {lines.map(l => (
          <li key={l.id}>
            <span>{l.line}</span>
            <span className="mini-meta">
              <span className="muted">{plural(t.importer.recentCount, l.count, locale)}</span>
              {l.undone ? <span className="tag">{t.importer.undoneLabel}</span> : null}
              {!l.undone && l.undoable ? <button type="button" className="link-button" onClick={() => setUndoing(l.id)}><Undo />{t.importer.undo}</button> : null}
            </span>
          </li>
        ))}
      </ul>
      {undoing && <UndoDialog id={undoing} onClose={() => setUndoing(null)} onDone={() => setUndoing(null)} locale={locale} t={t} />}
    </section>
  );
}
