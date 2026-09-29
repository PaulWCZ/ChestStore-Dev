"use client";

import { DataTable, FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AssetTag } from "../../../components/bits.tsx";
import type { Plan } from "../../../lib/importer.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { categoryName } from "../../../lib/words.ts";
import { checkImport, runImport } from "../actions.ts";

type Words = { importer: Catalogue["importer"]; errors: Catalogue["errors"]; status: Catalogue["status"]; categories: Catalogue["categories"]; files: Catalogue["files"]; table: Catalogue["table"] };
type PlanRow = Plan["rows"][number];
type Source = "snipe" | "csv";

// Pick the source and the file (the kit's file picker: by the button or by
// dropping it, the limits said first; the file stays in the browser), see
// what will come (the server reads the file and matches people), import.
// Nothing is added before the button.
export function Importer({ t, locale }: { t: Words; locale: string }) {
  const w = t.importer;
  const [picked, setPicked] = useState<{ source: Source; text: string; plan: Plan; keep: string[] | undefined } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [files, setFiles] = useState<Record<Source, readonly PickedFile[]>>({ snipe: [], csv: [] });
  // A file picked for one source: read it (the other source's goes).
  const pick = (source: Source) => (update: (current: readonly PickedFile[]) => PickedFile[]) => {
    const next = update(files[source]);
    setFiles({ snipe: [], csv: [], [source]: next });
    const added = next.find(f => !files[source].some(o => o.key === f.key));
    if (added?.file) void read(source, added.file);
    if (next.length === 0) setPicked(null);
  };

  async function read(source: Source, file: File) {
    setError(null);
    setDone(null);
    const text = await file.text();
    start(async () => {
      const r = await checkImport(source, text);
      if (!r.ok) {
        setPicked(null);
        return setError(format(t.errors[r.error], r.values));
      }
      setPicked({ source, text, plan: r.value, keep: undefined });
    });
  }
  // Keep a column as a field, or not: the plan is read again.
  function toggle(column: string) {
    if (!picked) return;
    const current = picked.keep ?? picked.plan.offered;
    const keep = current.includes(column) ? current.filter(c => c !== column) : [...current, column];
    setPicked({ ...picked, keep });
    start(async () => {
      const r = await checkImport(picked.source, picked.text, { keep });
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      setPicked(old => (old ? { ...old, plan: r.value, keep } : old));
    });
  }
  function submit() {
    if (!picked) return;
    start(async () => {
      const r = await runImport(picked.source, picked.text, picked.keep ? { keep: picked.keep } : undefined);
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      setDone(r.value.imported);
      setPicked(null);
      setFiles({ snipe: [], csv: [] });
    });
  }

  if (done !== null) {
    return (
      <div className="summary-box" role="status">
        <p className="strong">{plural(w.done, done, locale)}</p>
        <div className="row">
          <Link className="button" href="/chest/items">{w.open}</Link>
          <button type="button" className="button quiet" onClick={() => setDone(null)}>{w.again}</button>
        </div>
      </div>
    );
  }
  const sources: { source: Source; title: string; how: string }[] = [
    { source: "snipe", title: w.snipe, how: w.snipeHow },
    { source: "csv", title: w.csv, how: w.csvHow },
  ];
  const rows = picked?.plan.rows ?? [];
  const usable = rows.filter(r => !r.skip);
  const skipped = rows.length - usable.length;
  return (
    <div className="stack">
      <div className="sources">
        {sources.map(s => (
          <section key={s.source} className="source">
            <h2>{s.title}</h2>
            <p className="small muted">{s.how}</p>
            <FilePicker label={s.title} files={files[s.source]} onChange={pick(s.source)} maxFiles={1} maxSize={5 << 20} accept={[".csv", "text/csv", "text/plain"]} labels={t.files} />
          </section>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {picked && (
        <section className="summary-box" aria-labelledby="check">
          <h2 id="check">{w.check}</h2>
          <p className="strong">{format(w.summary, { items: usable.length, given: usable.filter(r => r.holder).length, placed: usable.filter(r => r.place).length })}</p>
          {picked.plan.newCategories.length > 0 && <p>{format(w.newCategories, { names: picked.plan.newCategories.join(", ") })}</p>}
          {picked.plan.offered.length > 0 && (
            <fieldset className="keep">
              <legend className="strong">{w.keep}</legend>
              <p className="hint">{w.keepHint}</p>
              <div className="row">
                {picked.plan.offered.map(c => (
                  <label key={c} className="check"><input type="checkbox" checked={(picked.keep ?? picked.plan.offered).includes(c)} onChange={() => toggle(c)} /><span>{c}</span></label>
                ))}
              </div>
            </fieldset>
          )}
          {picked.plan.newFields.length > 0 && <p>{format(w.newFields, { names: [...new Set(picked.plan.newFields.map(f => f.name))].join(", ") })}</p>}
          {picked.plan.ignored.length > 0 && <p className="small muted">{format(w.ignored, { names: picked.plan.ignored.join(", ") })}</p>}
          {skipped > 0 && <p className="small">{plural(w.skipped, skipped, locale)}</p>}
          <div className="preview-table">
            <DataTable<PlanRow>
              caption={format(w.rowsShown, { count: Math.min(rows.length, 50) })}
              showCaption
              rows={rows.slice(0, 50)}
              rowKey={r => String(r.line)}
              rowName={r => r.name}
              rowProps={r => ({ className: r.skip ? "skipped" : undefined })}
              labels={t.table}
              columns={[
                { key: "line", label: w.line, render: r => <span className="mono">{r.line}</span>, width: "narrow" },
                { key: "item", label: w.item, rowHeader: true, render: r => <><span className="strong">{r.name}</span> {r.tag && <AssetTag tag={r.tag} />}<span className="small muted block">{r.category.newName ?? (r.category.ref ? categoryName(r.category.ref, t) : "")} · {t.status[r.status]}</span></> },
                { key: "holder", label: w.holder, render: r => (r.holder ? r.holderText : r.place ?? "") },
                { key: "remarks", label: w.remarks, render: r => <span className="small">
                  {r.skip && <span className="error block">{w.problems[r.skip]}</span>}
                  {r.problems.map(p => <span key={p.code} className="block warn-text">{format(w.problems[p.code], { name: p.name ?? "" })}</span>)}
                </span> },
              ]}
            />
          </div>
          <div className="row end">
            <button type="button" className="button quiet" onClick={() => { setPicked(null); setFiles({ snipe: [], csv: [] }); }}>{w.cancel}</button>
            <button type="button" className="button" disabled={pending || usable.length === 0} onClick={submit}>{pending ? w.importing : plural(w.submit, usable.length, locale)}</button>
          </div>
        </section>
      )}
    </div>
  );
}
