"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format, plural } from "../../../../lib/i18n/format.ts";
import type { ImportPlan } from "../../../../lib/import.ts";
import { applyImport, checkImport } from "../../actions.ts";

type Words = { import: Catalogue["import"]; errors: Catalogue["errors"]; team: Catalogue["team"] };

export function Importer({ example, today, typeNames, t }: { example: string; today: string; typeNames: Record<string, string>; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [asOf, setAsOf] = useState(today);
  const [reason, setReason] = useState(t.import.reasonDefault);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locale = typeof document === "undefined" ? "en" : document.documentElement.lang || "en";

  const check = (value: string) => {
    setError(null);
    setPlan(null);
    if (!value.trim()) return;
    start(async () => {
      const result = await checkImport(value);
      if (!result.ok) setError(format(t.errors[result.error as ErrorCode], result.values));
      else setPlan(result.value);
    });
  };
  const ready = plan ? plan.rows.filter(r => r.problem === null && r.memberId).reduce((a, r) => a + r.values.length, 0) : 0;
  const ignored = plan ? plan.columns.filter(c => c.index > 0 && c.typeId === null).map(c => c.header).filter(Boolean) : [];

  return (
    <div className="importer">
      <details className="example">
        <summary>{t.import.example}</summary>
        <pre>{example}</pre>
      </details>
      <label className="button quiet file-button">
        {t.import.file}
        <input type="file" accept=".csv,text/csv,text/plain" className="visually-hidden" onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const value = await file.text();
          setText(value);
          check(value);
        }} />
      </label>
      <label htmlFor="csv" className="field-label">{t.import.paste}</label>
      <textarea id="csv" className="field mono" rows={6} value={text} onChange={e => setText(e.target.value)} />
      <button type="button" className="button quiet" disabled={pending || !text.trim()} onClick={() => check(text)}>{t.import.check}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {plan && (
        <>
          {ignored.length > 0 && <p className="notice">{format(t.import.ignored, { names: ignored.join(", ") })}</p>}
          <div className="table-wrap">
            <table className="people">
              <thead><tr><th scope="col">{t.import.line}</th><th scope="col">{t.import.name}</th><th scope="col">{t.import.matched}</th></tr></thead>
              <tbody>
                {plan.rows.map(r => (
                  <tr key={r.line} className={r.problem ? "problem" : undefined}>
                    <td>{r.line}</td>
                    <td>{r.name}</td>
                    <td>{r.problem ? <span className="error">{t.import.problems[r.problem]}</span> : r.values.map(v => `${typeNames[v.typeId] ?? ""} ${new Intl.NumberFormat(locale).format(v.days)}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ready === 0 ? <p className="error">{t.import.nothing}</p> : (
            <form className="form-row" onSubmit={e => {
              e.preventDefault();
              start(async () => {
                const result = await applyImport(text, asOf, reason);
                if (!result.ok) {
                  setError(format(t.errors[result.error as ErrorCode], result.values));
                  return;
                }
                toast(plural(t.import.done, result.value, locale));
                router.push("/chest/people");
              });
            }}>
              <div className="field-group">
                <label className="field-label" htmlFor="as-of">{t.import.asOf}</label>
                <input id="as-of" className="field" type="date" required value={asOf} onChange={e => setAsOf(e.target.value)} />
              </div>
              <div className="field-group grow">
                <label className="field-label" htmlFor="import-reason">{t.import.reason}</label>
                <input id="import-reason" className="field" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <button type="submit" className="button" disabled={pending}>{plural(t.import.apply, ready, locale)}</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
