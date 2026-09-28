"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Upload } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Field, Plan } from "../../../lib/importer.ts";
import { applyImport, previewImport } from "../actions.ts";

type Words = {
  import: {
    choose: string; reading: string; columns: string; fields: Record<Field, string>; line: string; person: string; changes: string; ready: string;
    skip: Record<"not_found" | "ambiguous" | "duplicate", string>; problems: Record<string, string>;
    dmy: string; mdy: string; summary: { zero?: string; one: string; other: string }; leftOut: { one: string; other: string };
    apply: { one: string; other: string }; applying: string; done: { zero?: string; one: string; other: string }; loops: string; another: string;
  };
  errors: Record<ErrorCode, string>;
};

// The file is read on the server twice: once to show what will change,
// once to import it — never trusting what the page shows.
export function Importer({ locale, t }: { locale: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPlan(null);
    if (file.size > 2 << 20) {
      setError(t.errors.import_invalid);
      return;
    }
    const content = await file.text();
    setText(content);
    start(async () => {
      const r = await previewImport(content);
      if (!r.ok) setError(format(t.errors[r.error], r.values ?? {}));
      else setPlan(r.value);
    });
  };
  const apply = () => {
    if (text === null) return;
    start(async () => {
      const r = await applyImport(text);
      if (!r.ok) {
        setError(format(t.errors[r.error], r.values ?? {}));
        return;
      }
      toast(plural(t.import.done, r.value.updated, locale));
      if (r.value.loops.length > 0) toast(format(t.import.loops, { names: r.value.loops.join(", ") }));
      router.push("/chest");
    });
  };
  const ready = plan?.rows.filter(r => r.memberId && !r.skip) ?? [];
  const left = (plan?.rows.length ?? 0) - ready.length;

  return (
    <div className="importer">
      <label className={plan ? "drop small" : "drop"}>
        <Upload />
        <span>{pending && !plan ? t.import.reading : plan ? t.import.another : t.import.choose}</span>
        <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="visually-hidden" onChange={e => void choose(e.target.files?.[0])} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {plan && (
        <>
          <div className="plan-summary">
            <p><strong>{plural(t.import.summary, ready.length, locale)}</strong>{left > 0 && <span className="muted"> · {plural(t.import.leftOut, left, locale)}</span>}</p>
            <p className="muted small">{t.import.columns}: {plan.columns.map(c => t.import.fields[c]).join(", ")}{plan.columns.includes("startDate") && " · " + (plan.dateOrder === "dmy" ? t.import.dmy : t.import.mdy)}</p>
          </div>
          <div className="table-frame">
            <table className="plan">
              <thead>
                <tr><th scope="col">{t.import.line}</th><th scope="col">{t.import.person}</th><th scope="col">{t.import.changes}</th></tr>
              </thead>
              <tbody>
                {plan.rows.map(r => (
                  <tr key={r.line} className={r.skip ? "skipped" : undefined}>
                    <td className="num">{r.line}</td>
                    <td>{r.name}</td>
                    <td>
                      {r.skip ? <span className="warn-text">{t.import.skip[r.skip]}</span> : (
                        <>
                          <span className="changes">{(Object.entries(r.changes) as [Field, string][]).map(([f, v]) => <span key={f} className="change"><span className="muted">{t.import.fields[f]}</span> {v}</span>)}</span>
                          {r.problems.map(p => <span key={p} className="warn-text">{t.import.problems[p]}</span>)}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row form-actions">
            <button type="button" className="button" disabled={pending || ready.length === 0} onClick={apply}>{pending ? t.import.applying : plural(t.import.apply, ready.length, locale)}</button>
          </div>
        </>
      )}
    </div>
  );
}
