"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AssetTag } from "../../../components/bits.tsx";
import { Upload } from "../../../components/icons.tsx";
import type { Plan } from "../../../lib/importer.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { categoryName } from "../../../lib/words.ts";
import { checkImport, runImport } from "../actions.ts";

type Words = { importer: Catalogue["importer"]; errors: Catalogue["errors"]; status: Catalogue["status"]; categories: Catalogue["categories"] };
type Source = "snipe" | "csv";

// Pick the source and the file, see what will come (the server reads the
// file and matches people), import. Nothing is added before the button.
export function Importer({ t, locale }: { t: Words; locale: string }) {
  const w = t.importer;
  const [picked, setPicked] = useState<{ source: Source; text: string; plan: Plan } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();

  async function read(source: Source, file: File) {
    setError(null);
    setDone(null);
    if (file.size > 5 << 20) return setError(w.tooBig);
    const text = await file.text();
    start(async () => {
      const r = await checkImport(source, text);
      if (!r.ok) {
        setPicked(null);
        return setError(format(t.errors[r.error], r.values));
      }
      setPicked({ source, text, plan: r.value });
    });
  }
  function submit() {
    if (!picked) return;
    start(async () => {
      const r = await runImport(picked.source, picked.text);
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      setDone(r.value.imported);
      setPicked(null);
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
            <label className="button quiet file-input">
              <Upload />{w.choose}
              <input type="file" accept=".csv,text/csv,text/plain" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(s.source, f); }} />
            </label>
          </section>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {picked && (
        <section className="summary-box" aria-labelledby="check">
          <h2 id="check">{w.check}</h2>
          <p className="strong">{format(w.summary, { items: usable.length, given: usable.filter(r => r.holder).length, placed: usable.filter(r => r.place).length })}</p>
          {picked.plan.newCategories.length > 0 && <p>{format(w.newCategories, { names: picked.plan.newCategories.join(", ") })}</p>}
          {picked.plan.ignored.length > 0 && <p className="small muted">{format(w.ignored, { names: picked.plan.ignored.join(", ") })}</p>}
          {skipped > 0 && <p className="small">{plural(w.skipped, skipped, locale)}</p>}
          <p className="small muted">{format(w.rowsShown, { count: Math.min(rows.length, 50) })}</p>
          <div className="table-wrap">
            <table className="preview">
              <thead><tr><th scope="col">{w.line}</th><th scope="col">{w.item}</th><th scope="col">{w.holder}</th><th scope="col">{w.remarks}</th></tr></thead>
              <tbody>
                {rows.slice(0, 50).map(r => (
                  <tr key={r.line} className={r.skip ? "skipped" : undefined}>
                    <td className="mono">{r.line}</td>
                    <td><span className="strong">{r.name}</span> {r.tag && <AssetTag tag={r.tag} />}<span className="small muted block">{r.category.newName ?? (r.category.ref ? categoryName(r.category.ref, t) : "")} · {t.status[r.status]}</span></td>
                    <td>{r.holder ? r.holderText : r.place ?? ""}</td>
                    <td className="small">
                      {r.skip && <span className="error">{w.problems[r.skip]}</span>}
                      {r.problems.map(p => <span key={p.code} className="block warn-text">{format(w.problems[p.code], { name: p.name ?? "" })}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row end">
            <button type="button" className="button quiet" onClick={() => setPicked(null)}>{w.cancel}</button>
            <button type="button" className="button" disabled={pending || usable.length === 0} onClick={submit}>{pending ? w.importing : plural(w.submit, usable.length, locale)}</button>
          </div>
        </section>
      )}
    </div>
  );
}
