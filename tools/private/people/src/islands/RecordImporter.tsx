import { DataTable, FilePicker, Segmented, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords, TableWords } from "@argentic/chest-ui/components/logic";
import { call, fill as format, navigate, plural as pluralIn, toast } from "@argentic/chest-app/client";
import { useId, useState } from "react";
import { useWorking } from "../components/busy.ts";
import type { Choices as Asked, Plan as Read, Problem, RecordTarget, Target } from "../lib/record-import.ts";

// The plan the server reads in the file (lib/record-import.ts), and the
// days in it written in the reader's words (days).
type Plan = Read & { days: Record<string, string> };
type Choices = Asked & { targets?: Target[] };

type Plural = { zero?: string; one: string; other: string };
type Words = {
  recordImport: {
    choose: string; reading: string; mapping: string; mappingHint: string; sample: string; columnsFound: string;
    targets: Record<"skip" | "first" | "last" | "email" | "street" | "street2" | "postcode" | "city" | "country", string>;
    unread: Plural; missingName: string; missingField: string; dateQuestion: string; dmy: string; mdy: string;
    line: string; person: string; changes: string;
    actions: Record<"update" | "create_member" | "create_other", string>;
    skip: Record<"ambiguous" | "duplicate" | "no_name", string>;
    problems: Record<Problem, string>;
    summary: Plural; leftOut: Plural; apply: Plural; applying: string; done: string;
  };
  fields: Record<RecordTarget, string>;
  contracts: Record<string, string>; sexes: Record<string, string>; workingTimes: Record<string, string>;
  files: FileWords;
  tables: TableWords;
};

// HR records from a spreadsheet: the file is read on the server each time
// (to show what each column holds and what each row does, then to import
// it), never trusting what the page shows. The same steps as the profile
// import: HR corrects what a column holds, says how dates are written when
// they could be read both ways, and sees each row before importing.
export function RecordImporter({ locale, order, t }: { locale: string; order: RecordTarget[]; t: Words }) {
  const plural = (forms: { zero?: string; one: string; other: string }, n: number, _locale: string, values: Record<string, string | number> = {}) => pluralIn(locale, forms, n, values);
  const uid = useId();
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [text, setText] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [choices, setChoices] = useState<Choices>({});
  const [error, setError] = useState<string | null>(null);
  const { working: pending, track } = useWorking();
  const w = t.recordImport;

  const preview = async (content: string, next: Choices) => {
    const { value: r, latest } = await track(() => call("previewRecords", { text: content, choices: next }, { refresh: false, quiet: true }));
    if (!latest) return;
    if (!r.ok) setError(r.message);
    else { setError(null); setPlan(r.value); }
  };
  const pick = (update: (current: readonly PickedFile[]) => PickedFile[]) => {
    const next = update(files);
    setFiles(next);
    if (next[0]?.key === files[0]?.key) return;
    setError(null); setPlan(null); setChoices({}); setText(null);
    const file = next[0]?.file;
    if (!file) return;
    void file.text().then(content => { setText(content); void preview(content, {}); });
  };
  const change = (next: Choices) => {
    setChoices(next);
    if (text !== null) void preview(text, next);
  };
  const apply = () => {
    if (text === null) return;
    void track(async () => {
      const r = await call("applyRecords", { text, choices }, { refresh: false, quiet: true });
      if (!r.ok) { setError(r.message); return; }
      toast({ id: "records-import", text: format(w.done, { created: r.value.created, updated: r.value.updated }) });
      await navigate("/chest/records");
    });
  };
  const targetWord = (target: Target): string => (target in w.targets ? w.targets[target as keyof typeof w.targets] : t.fields[target as RecordTarget]);
  const options: Target[] = ["skip", "first", "last", "email", ...order, "street", "street2", "postcode", "city", "country"];
  const ready = plan?.rows.filter(r => r.action) ?? [];
  const left = (plan?.rows.length ?? 0) - ready.length;
  const found = plan ? plan.targets.filter(x => x !== "skip").map(targetWord).join(", ") : "";
  const shown = (field: RecordTarget, value: string) => {
    // A day as the reader writes it, written by the server with the plan.
    if (plan?.days[value]) return plan.days[value];
    if (field === "contract") return t.contracts[value] ?? value;
    if (field === "sex") return t.sexes[value] ?? value;
    if (field === "workingTime") return t.workingTimes[value] ?? value;
    return value;
  };

  return (
    <div className="importer">
      <FilePicker label={w.choose} files={files} onChange={pick} accept={[".csv", "text/csv"]} maxFiles={1} maxSize={2 << 20} labels={t.files} />
      <p className="muted small" role="status">{pending && !plan ? w.reading : ""}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {plan && (
        <>
          {plan.leftOut.length > 0 && <p className="banner warn" role="status">{plural(w.unread, plan.leftOut.length, locale, { list: plan.leftOut.join(", ") })}</p>}
          <details className="mapping" open={plan.missing !== null || plan.leftOut.length > 0 || undefined}>
            <summary>{format(w.columnsFound, { list: found || "—" })}</summary>
            <p className="muted small">{w.mappingHint}</p>
            <h2 className="visually-hidden">{w.mapping}</h2>
            <ul className="mapping-list">
              {plan.headers.map((header, i) => (
                <li key={i}>
                  <label htmlFor={`${uid}-col-${i}`}>
                    <strong>{header || "—"}</strong>
                    {plan.samples[i]!.length > 0 && <span className="muted small">{format(w.sample, { values: plan.samples[i]!.join(", ") })}</span>}
                  </label>
                  <select id={`${uid}-col-${i}`} className="select" value={plan.targets[i]} disabled={pending} onChange={e => {
                    const next = [...plan.targets];
                    const chosen = e.target.value as Target;
                    if (chosen !== "skip") next.forEach((x, k) => { if (x === chosen) next[k] = "skip"; });
                    next[i] = chosen;
                    change({ ...choices, targets: next });
                  }}>
                    {options.map(o => <option key={o} value={o}>{targetWord(o)}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </details>
          {plan.missing && <p className="banner warn" role="alert">{plan.missing === "name" ? w.missingName : w.missingField}</p>}
          {plan.askDateOrder && (
            <div className="date-order">
              <Segmented label={w.dateQuestion} hideLabel={false} value={choices.dateOrder === "dmy" || choices.dateOrder === "mdy" ? choices.dateOrder : plan.dateOrder} onChange={o => change({ ...choices, targets: plan.targets, dateOrder: o })}
                options={[{ value: "dmy", label: w.dmy }, { value: "mdy", label: w.mdy }]} />
            </div>
          )}
          {!plan.missing && (
            <>
              <div className="plan-summary">
                <p><strong>{plural(w.summary, ready.length, locale)}</strong>{left > 0 && <span className="muted"> · {plural(w.leftOut, left, locale)}</span>}</p>
                {!plan.askDateOrder && <p className="muted small">{plan.dateOrder === "dmy" ? w.dmy : w.mdy}</p>}
              </div>
              <div className="plan">
                <DataTable
                  caption={w.changes}
                  rows={plan.rows}
                  rowKey={r => String(r.line)}
                  labels={t.tables}
                  columns={[
                    { key: "line", label: w.line, value: r => r.line, width: "narrow" },
                    { key: "person", label: w.person, value: r => r.name, rowHeader: true },
                    {
                      key: "changes", label: w.changes, render: r => r.skip ? <span className="warn-text">{w.skip[r.skip]}</span> : (
                        <>
                          {r.action && <span className="source">{w.actions[r.action]}</span>}
                          <span className="changes">
                            {(Object.entries(r.changes) as [RecordTarget, string][]).map(([f, v]) => <span key={f} className="change"><span className="muted">{t.fields[f]}</span> {shown(f, v)}</span>)}
                          </span>
                          {r.problems.map(p => <span key={p} className="warn-text">{w.problems[p]}</span>)}
                        </>
                      ),
                    },
                  ]}
                />
              </div>
              <div className="row form-actions">
                <button type="button" className="button" disabled={pending || ready.length === 0} onClick={apply}>{pending ? w.applying : plural(w.apply, ready.length, locale)}</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
