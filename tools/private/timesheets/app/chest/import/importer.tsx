"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Upload } from "../../../components/icons.tsx";
import { formatDuration } from "../../../lib/duration.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, formatDay, plural } from "../../../lib/i18n/format.ts";
import type { ImportPlan } from "../../../lib/import.ts";
import { maxBytes, type DateOrder } from "../../../lib/import-formats.ts";
import { importTime, previewImport } from "../actions.ts";

type Words = { importer: Catalogue["importer"]; errors: Catalogue["errors"] };

// Choose the file, check what will come (people found or not, what will
// be created, what is left out and why), import. Nothing is saved before
// the last button.
export function Importer({ locale, t }: { locale: string; t: Words }) {
  const w = t.importer;
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [order, setOrder] = useState<DateOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ count: number; from: string | null; to: string | null } | null>(null);
  const [pending, start] = useTransition();

  function preview(text: string, chosen: DateOrder | null) {
    start(async () => {
      const r = await previewImport(text, chosen);
      if (!r.ok) {
        setPlan(null);
        return setError(format(t.errors[r.error], r.values));
      }
      setError(null);
      setPlan(r.value);
    });
  }
  async function pick(f: File) {
    setDone(null);
    setPlan(null);
    setOrder(null);
    if (f.size > maxBytes) return setError(format(t.errors.import_too_big, { max: 5 }));
    const text = await f.text();
    setFile({ name: f.name, text });
    preview(text, null);
  }
  function submit() {
    if (!file) return;
    start(async () => {
      const r = await importTime(file.text, order);
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      setDone({ count: r.value.imported, from: plan?.from ?? null, to: plan?.to ?? null });
      setPlan(null);
      setFile(null);
    });
  }

  if (done !== null) {
    return (
      <div className="panel" role="status">
        <p className="big-line">{plural(w.done, done.count, locale)}</p>
        <div className="row">
          <Link className="button" href={done.from && done.to ? `/chest/reports?preset=custom&from=${done.from}&to=${done.to}&group=person` : "/chest/reports"}>{w.open}</Link>
          <button type="button" className="button quiet" onClick={() => setDone(null)}>{w.again}</button>
        </div>
      </div>
    );
  }

  const skipped = plan ? (Object.entries(plan.skipped) as [keyof ImportPlan["skipped"], number][]).filter(([, n]) => n > 0) : [];
  return (
    <div className="importer">
      <ul className="sources">
        {(["toggl", "clockify", "harvest"] as const).map(s => (
          <li key={s} className="source">
            <strong>{w.sources[s]}</strong>
            <span className="muted small">{w.how[s]}</span>
          </li>
        ))}
      </ul>
      <label className="button file-input">
        <Upload />{w.choose}
        <input type="file" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pick(f); }} />
      </label>
      {file && <p className="muted small">{file.name}</p>}
      {pending && !plan && <p className="muted" role="status">{w.reading}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {plan && (
        <section className="panel check-panel" aria-labelledby="check-title">
          <h2 id="check-title">{w.check}</h2>
          <p>{format(w.from, { source: w.sources[plan.source] })} · {plural(w.rows, plan.rows, locale)}</p>
          {plan.dates.ambiguous && (
            <fieldset className="field-block">
              <legend className="label">{w.dates}</legend>
              <div className="segmented">
                {(["dmy", "mdy"] as const).map(o => (
                  <label key={o} className="seg">
                    <input type="radio" name="order" checked={(order ?? plan.dates.order) === o} onChange={() => { setOrder(o); if (file) preview(file.text, o); }} />
                    <span>{o === "dmy" ? w.dayFirst : w.monthFirst}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <p className="big-line">{plan.ready ? plural(w.ready, plan.ready, locale) : w.readyNone}</p>
          {plan.from && plan.to && <p className="num">{format(w.span, { from: formatDay(plan.from, locale, { day: "numeric", month: "short", year: "numeric" }), to: formatDay(plan.to, locale, { day: "numeric", month: "short", year: "numeric" }), hours: formatDuration(plan.minutes) })}</p>}
          <h3 className="label">{w.people}</h3>
          <p className="hint">{w.peopleHint}</p>
          <ul className="import-people">
            {plan.people.map(p => (
              <li key={p.name} className={p.memberId ? "found" : "missing"}>
                <span>{p.name}</span>
                <span className="muted small">{plural(w.rows, p.rows, locale)} · {p.memberId ? w.matched : w.unmatched}</span>
              </li>
            ))}
          </ul>
          <h3 className="label">{w.created}</h3>
          {plan.newClients.length + plan.newProjects.length + plan.newTasks === 0 ? <p className="muted">{w.nothingNew}</p> : (
            <p>
              {[plan.newClients.length ? plural(w.newClients, plan.newClients.length, locale) : null, plan.newProjects.length ? plural(w.newProjects, plan.newProjects.length, locale) : null, plan.newTasks ? plural(w.newTasks, plan.newTasks, locale) : null].filter(Boolean).join(" · ")}
              {plan.newProjects.length > 0 && <span className="muted small block">{plan.newProjects.slice(0, 12).map(p => (p.client ? `${p.client} › ${p.name}` : p.name)).join(", ")}{plan.newProjects.length > 12 ? "…" : ""}</span>}
            </p>
          )}
          {skipped.length > 0 && (
            <>
              <h3 className="label">{w.left}</h3>
              <ul className="skipped">{skipped.map(([k, n]) => <li key={k}>{plural(w.skipped[k], n, locale)}</li>)}</ul>
            </>
          )}
          {plan.ready > 0 && <button type="button" className="button" disabled={pending} onClick={submit}>{pending ? w.importing : plural(w.submit, plan.ready, locale)}</button>}
        </section>
      )}
    </div>
  );
}
