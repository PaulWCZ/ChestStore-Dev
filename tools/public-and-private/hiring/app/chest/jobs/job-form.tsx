"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Bold, Heading, List } from "../../../components/icons.tsx";
import { RichText } from "../../../components/rich-text.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format, languageNames } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { Job } from "../../../lib/jobs.ts";
import { contracts, currencies, languages, limits, periods, remotes } from "../../../lib/model.ts";
import { createJob, updateJob } from "../actions.ts";

type Words = { jobForm: Catalogue["jobForm"]; facts: Catalogue["facts"]; errors: Catalogue["errors"] };

// Writing a job: the facts a candidate looks for first, the description
// (a few marks anyone can type, a preview), the salary. A new job is saved
// as a draft: nothing is public until "Publish" on its board.
export function JobForm({ job, defaultLanguage, t }: { job: Job | null; defaultLanguage: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState(job?.description ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const area = useRef<HTMLTextAreaElement>(null);
  const w = t.jobForm;

  // The toolbar writes the marks around the selection, as one would type them.
  function mark(kind: "bold" | "list" | "heading") {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    let next: string, from: number, to: number;
    if (kind === "bold") {
      const inner = value.slice(a, b) || w.bold;
      next = value.slice(0, a) + "**" + inner + "**" + value.slice(b);
      [from, to] = [a + 2, a + 2 + inner.length];
    } else {
      const start = value.lastIndexOf("\n", a - 1) + 1;
      const end = b > a && value[b - 1] === "\n" ? b - 1 : b;
      const prefix = kind === "list" ? "- " : "## ";
      const block = value.slice(start, end).split("\n").map(line => (line.startsWith(prefix) ? line : prefix + line.replace(/^(#{1,3}\s+|[-*•]\s+)/u, ""))).join("\n");
      next = value.slice(0, start) + block + value.slice(end);
      [from, to] = [start, start + block.length];
    }
    setDescription(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from, to);
    });
  }

  function submit(data: FormData) {
    setError(null);
    const input = {
      title: String(data.get("title") ?? ""),
      team: String(data.get("team") ?? ""),
      place: String(data.get("place") ?? ""),
      contract: String(data.get("contract") ?? ""),
      remote: String(data.get("remote") ?? ""),
      language: String(data.get("language") ?? ""),
      description,
      salaryMin: String(data.get("salaryMin") ?? ""),
      salaryMax: String(data.get("salaryMax") ?? ""),
      salaryCurrency: String(data.get("salaryCurrency") ?? ""),
      salaryPeriod: String(data.get("salaryPeriod") ?? ""),
      salaryShown: data.get("salaryShown") === "on",
    };
    start(async () => {
      const result = job ? await updateJob(job.id, input) : await createJob(input);
      if (!result.ok) return setError(format(t.errors[result.error], result.values ?? {}));
      if (job) {
        toast(w.saved);
        router.push(`/chest/jobs/${job.id}`);
      } else router.push(`/chest/jobs/${(result.value as { id: string }).id}`);
    });
  }

  return (
    <form className="job-form" onSubmit={e => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
      <div className="field-block">
        <label className="label" htmlFor="title">{w.title}</label>
        <input id="title" name="title" className="field big-field" required maxLength={limits.title} defaultValue={job?.title ?? ""} placeholder={w.titlePlaceholder} autoFocus={!job} />
      </div>
      <div className="three">
        <div className="field-block">
          <label className="label" htmlFor="team">{w.team}</label>
          <input id="team" name="team" className="field" maxLength={limits.team} defaultValue={job?.team ?? ""} placeholder={w.teamPlaceholder} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="place">{w.place}</label>
          <input id="place" name="place" className="field" maxLength={limits.place} defaultValue={job?.place ?? ""} placeholder={w.placePlaceholder} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor="language">{w.language}</label>
          <select id="language" name="language" className="field" defaultValue={job?.language ?? defaultLanguage} aria-describedby="language-hint">
            {languages.map(l => <option key={l} value={l}>{languageNames[l]}</option>)}
          </select>
        </div>
      </div>
      <p className="hint tight" id="language-hint">{w.languageHint}</p>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor="contract">{w.contract}</label>
          <select id="contract" name="contract" className="field" defaultValue={job?.contract ?? "permanent"}>
            {contracts.map(c => <option key={c} value={c}>{t.facts.contract[c]}</option>)}
          </select>
        </div>
        <div className="field-block">
          <label className="label" htmlFor="remote">{w.remote}</label>
          <select id="remote" name="remote" className="field" defaultValue={job?.remote ?? "onsite"}>
            {remotes.map(r => <option key={r} value={r}>{t.facts.remote[r]}</option>)}
          </select>
        </div>
      </div>

      <div className="field-block">
        <div className="editor-head">
          <label className="label" htmlFor="description">{w.description}</label>
          <div className="segmented" role="tablist" aria-label={w.description}>
            <button type="button" role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>{w.write}</button>
            <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>{w.preview}</button>
          </div>
        </div>
        {tab === "write" ? (
          <div className="editor">
            <div className="toolbar">
              <button type="button" className="icon-button" onClick={() => mark("heading")} title={w.heading}><Heading /><span className="visually-hidden">{w.heading}</span></button>
              <button type="button" className="icon-button" onClick={() => mark("bold")} title={w.bold}><Bold /><span className="visually-hidden">{w.bold}</span></button>
              <button type="button" className="icon-button" onClick={() => mark("list")} title={w.list}><List /><span className="visually-hidden">{w.list}</span></button>
            </div>
            <textarea ref={area} id="description" className="field editor-area" rows={14} maxLength={limits.description} value={description} onChange={e => setDescription(e.target.value)} placeholder={w.descriptionPlaceholder} aria-describedby="description-hint" />
          </div>
        ) : (
          <div className="editor-preview">{description.trim() ? <RichText source={description} /> : <p className="muted">{w.previewEmpty}</p>}</div>
        )}
        <p className="hint" id="description-hint">{w.descriptionHint}</p>
      </div>

      <fieldset className="salary">
        <legend className="label">{w.salary}</legend>
        <div className="salary-row">
          <div className="field-block">
            <label className="small-label" htmlFor="salaryMin">{w.salaryMin}</label>
            <input id="salaryMin" name="salaryMin" className="field" inputMode="numeric" maxLength={12} defaultValue={job?.salaryMin ?? ""} />
          </div>
          <div className="field-block">
            <label className="small-label" htmlFor="salaryMax">{w.salaryMax}</label>
            <input id="salaryMax" name="salaryMax" className="field" inputMode="numeric" maxLength={12} defaultValue={job?.salaryMax ?? ""} />
          </div>
          <div className="field-block">
            <label className="small-label" htmlFor="salaryCurrency">{w.currency}</label>
            <select id="salaryCurrency" name="salaryCurrency" className="field" defaultValue={job?.salaryCurrency ?? "EUR"}>
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field-block">
            <label className="small-label" htmlFor="salaryPeriod">{w.period}</label>
            <select id="salaryPeriod" name="salaryPeriod" className="field" defaultValue={job?.salaryPeriod ?? "year"}>
              {periods.map(p => <option key={p} value={p}>{w.periods[p]}</option>)}
            </select>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" name="salaryShown" defaultChecked={job?.salaryShown ?? true} />
          <span>{w.salaryShown}</span>
        </label>
        <p className="hint">{w.salaryHint}</p>
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{job ? w.save : w.create}</button>
        <button type="button" className="button quiet" onClick={() => router.back()}>{w.back}</button>
      </div>
    </form>
  );
}
