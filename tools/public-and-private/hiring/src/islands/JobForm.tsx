import { call, navigate, toast } from "@argentic/chest-app/client";
import type { DateWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { useDateProblems, WatchedDateField } from "../components/date-problems.tsx";
import { DescriptionEditor } from "../components/description-editor.tsx";
import { Bin, Plus } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, languageNames } from "../shared/format.ts";
import { contracts, currencies, hoursKinds, languages, limits, periods, questionKinds, remotes, type Contract, type Currency, type Hours, type Period, type Question, type QuestionKind, type Remote } from "../shared/model.ts";

type Words = { jobForm: Catalogue["jobForm"]; facts: Catalogue["facts"]; tooLong: string; date: DateWords };
// A job as the form starts from it.
type Job = {
  id: string; title: string; team: string; place: string; contract: Contract; remote: Remote; description: string; language: string;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: Currency; salaryPeriod: Period; salaryShown: boolean;
  country: string; postalCode: string; street: string; hours: Hours; closesOn: string | null; questions: Question[];
};
// A question as the editor holds it: its options one per line.
type Draft = { id: string; kind: QuestionKind; label: string; options: string; required: boolean };
const toDraft = (q: Question): Draft => ({ id: q.id, kind: q.kind, label: q.label, options: q.options.join("\n"), required: q.required });

// Writing a job: the facts a candidate looks for first, the description
// (a real editor: headings, bold, lists as they will look), the salary. A new job is saved
// as a draft: nothing is public until "Publish" on its board. start: a
// job to start from (a template's title, team and description).
export function JobForm({ job, start: from, defaultLanguage, defaultCountry, countryNames, today, t }: { job: Job | null; start?: { title: string; team: string; description: string }; defaultLanguage: string; defaultCountry: string; countryNames: [string, string][]; today: string; t: Words }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState(job?.description ?? from?.description ?? "");
  const [closesOn, setClosesOn] = useState<string | null>(job?.closesOn || null);
  // A closing day the field could not read leaves the previous one in
  // `closesOn`: saving waits, on the field and its sentence.
  const dates = useDateProblems();
  const [questions, setQuestions] = useState<Draft[]>(() => (job?.questions ?? []).map(toDraft));
  const w = t.jobForm;
  const change = (i: number, patch: Partial<Draft>) => setQuestions(list => list.map((q, k) => (k === i ? { ...q, ...patch } : q)));

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
      country: String(data.get("country") ?? ""),
      postalCode: String(data.get("postalCode") ?? ""),
      street: String(data.get("street") ?? ""),
      hours: String(data.get("hours") ?? ""),
      closesOn: closesOn ?? "",
      questions: questions.map(q => ({ id: q.id, kind: q.kind, label: q.label, options: q.options.split("\n").map(o => o.trim()).filter(Boolean), required: q.required })),
    };
    setPending(true);
    void (async () => {
      const result = job ? await call("updateJob", { id: job.id, job: input }, { quiet: true, refresh: false }) : await call("createJob", { job: input }, { quiet: true, refresh: false });
      setPending(false);
      if (!result.ok) return setError(result.message);
      if (job) {
        toast(w.saved);
        await navigate(`/chest/jobs/${job.id}`);
      } else await navigate(`/chest/jobs/${(result.value as { id: string }).id}`);
    })();
  }

  return (
    <form className="job-form" onSubmit={e => {
      e.preventDefault();
      if (dates.problem) { document.getElementById("closesOn")?.focus(); return; }
      submit(new FormData(e.currentTarget));
    }}>
      <div className="field-block">
        <label className="label" htmlFor="title">{w.title}</label>
        <input id="title" name="title" className="field big-field" required maxLength={limits.title} defaultValue={job?.title ?? from?.title ?? ""} placeholder={w.titlePlaceholder} autoFocus={!job} />
      </div>
      <div className="three">
        <div className="field-block">
          <label className="label" htmlFor="team">{w.team}</label>
          <input id="team" name="team" className="field" maxLength={limits.team} defaultValue={job?.team ?? from?.team ?? ""} placeholder={w.teamPlaceholder} />
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
      <div className="three">
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
        <div className="field-block">
          <label className="label" htmlFor="hours">{w.hours}</label>
          <select id="hours" name="hours" className="field" defaultValue={job?.hours ?? "full_time"}>
            {hoursKinds.map(h => <option key={h} value={h}>{t.facts.hours[h]}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="salary">
        <legend className="label">{w.address}</legend>
        <p className="hint tight-top">{w.addressHint}</p>
        <div className="address-row">
          <div className="field-block">
            <label className="small-label" htmlFor="street">{w.street} <span className="optional">{w.optional}</span></label>
            <input id="street" name="street" className="field" maxLength={limits.street} defaultValue={job?.street ?? ""} autoComplete="off" />
          </div>
          <div className="field-block">
            <label className="small-label" htmlFor="postalCode">{w.postalCode}</label>
            <input id="postalCode" name="postalCode" className="field" maxLength={limits.postalCode} defaultValue={job?.postalCode ?? ""} autoComplete="off" />
          </div>
          <div className="field-block">
            <label className="small-label" htmlFor="country">{w.country}</label>
            <select id="country" name="country" className="field" defaultValue={job?.country ?? defaultCountry}>
              {countryNames.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
        </div>
      </fieldset>

      <div className="field-block">
        <span className="label" id="description-label">{w.description}</span>
        <DescriptionEditor id="description" labelledBy="description-label" describedBy="description-hint" value={description} max={limits.description} onChange={setDescription}
          t={{ heading: w.heading, bold: w.bold, list: w.list, placeholder: w.descriptionPlaceholder, tooLong: format(t.tooLong, { max: limits.description }) }} />
        <p className="hint" id="description-hint">{w.descriptionHint}</p>
      </div>

      <fieldset className="salary questions-editor">
        <legend className="label">{w.questions} <span className="optional">{w.optional}</span></legend>
        <p className="hint tight-top">{w.questionsHint}</p>
        <p className="hint">{w.questionsForbidden}</p>
        {questions.map((q, i) => (
          <div key={q.id || i} className="question-row">
            <div className="question-top">
              <div className="field-block grow">
                <label className="small-label" htmlFor={`q-label-${i}`}>{w.question} {i + 1}</label>
                <input id={`q-label-${i}`} className="field" required maxLength={limits.questionLabel} value={q.label} onChange={e => change(i, { label: e.target.value })} placeholder={w.questionPlaceholder} />
              </div>
              <div className="field-block">
                <label className="small-label" htmlFor={`q-kind-${i}`}>{w.answerKind}</label>
                <select id={`q-kind-${i}`} className="field" value={q.kind} onChange={e => change(i, { kind: e.target.value as QuestionKind })}>
                  {questionKinds.map(k => <option key={k} value={k}>{w.kinds[k]}</option>)}
                </select>
              </div>
              <button type="button" className="button link small" onClick={() => setQuestions(list => list.filter((_, k) => k !== i))} aria-label={`${w.removeQuestion} ${i + 1}`}><Bin />{w.removeQuestion}</button>
            </div>
            {q.kind === "choice" && (
              <div className="field-block">
                <label className="small-label" htmlFor={`q-options-${i}`}>{w.options}</label>
                <textarea id={`q-options-${i}`} className="field" rows={3} value={q.options} onChange={e => change(i, { options: e.target.value })} placeholder={w.optionsPlaceholder} />
              </div>
            )}
            <label className="check"><input type="checkbox" checked={q.required} onChange={e => change(i, { required: e.target.checked })} /><span>{w.required}</span></label>
          </div>
        ))}
        {questions.length < limits.questions && (
          <button type="button" className="button quiet small" onClick={() => setQuestions(list => [...list, { id: "", kind: "yesno", label: "", options: "", required: false }])}><Plus />{w.addQuestion}</button>
        )}
      </fieldset>

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

      <div className="field-block">
        <WatchedDateField id="closesOn" label={w.closesOnOptional} value={closesOn} onChange={setClosesOn} onProblem={dates.watch("closesOn")} today={today} hint={w.closesOnHint} labels={t.date} />
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{job ? w.save : w.create}</button>
        <button type="button" className="button quiet" onClick={() => history.back()}>{w.back}</button>
      </div>
    </form>
  );
}
