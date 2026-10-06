import { Checkbox, PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type Choice, type DateWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { call, fill, navigate, toast } from "@argentic/chest-app/client";
import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useBusy } from "../components/busy.ts";
import { useDateProblems, WatchedDateField } from "../components/date-problems.tsx";
import { Close, Plus } from "../components/icons.tsx";
import { Portrait } from "../components/portrait.tsx";
import { offered } from "../shared/choices.ts";
import { limits } from "../shared/model.ts";

type Own = { phone: string; pronouns: string; bio: string; skills: string[]; birthday: string | null };
type Job = { title: string; team: string; office: string; managerId: string | null; startDate: string | null; phone: string };
type Words = {
  edit: Record<"more" | "moreHint" | "aboutYou" | "aboutThem" | "phone" | "phoneHint" | "pronouns" | "pronounsHint" | "bio" | "bioHint" | "skills" | "skillsHint" | "skillPlaceholder" | "addSkill" | "removeSkill" | "birthday" | "birthdayHint" | "day" | "month" | "job" | "jobHint" | "title" | "team" | "office" | "manager" | "startDate" | "save" | "saving" | "saved" | "cancel", string>;
  date: DateWords;
  peoplePicker: PeoplePickerWords;
  leaveEmpty: string;
};

// The profile form: "About you" for oneself, "Job" for HR. Saved in one
// click; a refusal says why and keeps what was typed.
export function ProfileForm({ person, own, job, jobView, managers, known, extras, months, today, lang, t }: {
  person: { id: string; name: string; photo: string | null; team: string };
  own: Own | null;
  job: Job | null;
  jobView: { title: string; team: string; office: string };
  managers: { id: string; name: string }[];
  known: { teams: string[]; offices: string[]; titles: string[] };
  extras: { id: string; label: string; value: string; shown: string; editable: boolean; kind: "text" | "date" | "choice"; options: string[] }[];
  months: string[];
  // Today in the Chest's time zone (for the date field), and the words' language.
  today: string;
  lang: string;
  t: Words;
}) {
  const uid = useId();
  const [pending, run] = useBusy();
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>(own?.skills ?? []);
  const [skill, setSkill] = useState("");
  const [showBirthday, setShowBirthday] = useState(own?.birthday != null);
  const [month, setMonth] = useState(own?.birthday ? Number(own.birthday.slice(0, 2)) : 1);
  const [day, setDay] = useState(own?.birthday ? Number(own.birthday.slice(3)) : 1);
  // HR's date fields, in the kit's date field (never the browser's).
  const [dates, setDates] = useState<Record<string, string | null>>(() => Object.fromEntries(extras.filter(x => x.kind === "date").map(x => [x.id, x.value || null])));
  // The manager: a person picker over those offered (none below the person).
  const [manager, setManager] = useState<Choice[]>(() => managers.filter(m => m.id === job?.managerId).map(m => ({ id: m.id, name: m.name })));
  const searchManagers = useMemo(() => localSearch(managers), [managers]);
  const [startDate, setStartDate] = useState<string | null>(job?.startDate ?? null);
  // A day refused by its field (kit 0.2.4) leaves the previous one in
  // `startDate` or `dates`: the profile (noValidate: the browser does not
  // stop it) waits.
  const refused = useDateProblems();
  const longest = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;

  const addSkill = () => {
    const text = skill.replace(/\s+/gu, " ").trim();
    if (!text) return;
    if (!skills.some(s => s.toLowerCase() === text.toLowerCase()) && skills.length < limits.skills) setSkills([...skills, text.slice(0, limits.skill)]);
    setSkill("");
  };
  const onSkillKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill();
    } else if (e.key === "Backspace" && skill === "" && skills.length > 0) setSkills(skills.slice(0, -1));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (refused.problem) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");
    const pendingSkill = skill.replace(/\s+/gu, " ").trim();
    const allSkills = pendingSkill && !skills.includes(pendingSkill) ? [...skills, pendingSkill] : skills;
    const ownInput = own ? { phone: text("phone"), pronouns: text("pronouns"), bio: text("bio"), skills: allSkills, birthday: showBirthday ? { month, day: Math.min(day, longest) } : null } : null;
    const jobInput = job ? { title: text("title"), team: text("team"), office: text("office"), managerId: manager[0]?.id ?? null, startDate, ...(own ? {} : { phone: text("phone") }) } : null;
    const extraInput = Object.fromEntries(extras.filter(x => x.editable).map(x => [x.id, x.kind === "date" ? dates[x.id] ?? "" : text("x-" + x.id)]));
    setError(null);
    void run(async () => {
      const result = await call("saveProfile", { id: person.id, own: ownInput, job: jobInput, extras: extraInput }, { refresh: false, quiet: true });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast({ id: "profile-saved", text: t.edit.saved });
      await navigate(`/chest/people/${person.id}`);
    });
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {own && (
        <fieldset className="card-block">
          <legend>{t.edit.aboutYou}</legend>
          <div className="with-portrait">
            <Portrait name={person.name} photo={person.photo} size={72} team={person.team} />
            <div className="field-group">
              <label htmlFor={uid + "phone"} className="label">{t.edit.phone}</label>
              <input id={uid + "phone"} name="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" defaultValue={own.phone} maxLength={limits.phone} aria-describedby={uid + "phone-hint"} />
              <p id={uid + "phone-hint"} className="hint">{t.edit.phoneHint}</p>
            </div>
          </div>
          <div className="field-group">
            <label htmlFor={uid + "skill"} className="label">{t.edit.skills}</label>
            <div className="chips-input">
              {skills.map(s => (
                <span key={s} className="topic removable">
                  {s}
                  <button type="button" onClick={() => setSkills(skills.filter(x => x !== s))} aria-label={fill(t.edit.removeSkill, { name: s })}><Close /></button>
                </span>
              ))}
              <input id={uid + "skill"} value={skill} onChange={e => setSkill(e.target.value)} onKeyDown={onSkillKey} onBlur={addSkill} placeholder={skills.length === 0 ? t.edit.skillPlaceholder : ""} maxLength={limits.skill} aria-describedby={uid + "skill-hint"} disabled={skills.length >= limits.skills} />
              <button type="button" className="button quiet small" onClick={addSkill} disabled={!skill.trim()}><Plus />{t.edit.addSkill}</button>
            </div>
            <p id={uid + "skill-hint"} className="hint">{t.edit.skillsHint}</p>
          </div>
          <div className="field-group">
            <label htmlFor={uid + "bio"} className="label">{t.edit.bio}</label>
            <textarea id={uid + "bio"} name="bio" className="field" rows={4} defaultValue={own.bio} maxLength={limits.bio} aria-describedby={uid + "bio-hint"} />
            <p id={uid + "bio-hint"} className="hint">{t.edit.bioHint}</p>
          </div>
          <div className="field-group">
            <label htmlFor={uid + "pronouns"} className="label">{t.edit.pronouns}</label>
            <input id={uid + "pronouns"} name="pronouns" className="field short" defaultValue={own.pronouns} maxLength={limits.pronouns} placeholder={t.edit.pronounsHint} />
          </div>
          <div className="field-group">
            <Checkbox label={t.edit.birthday} checked={showBirthday} onChange={setShowBirthday} hint={t.edit.birthdayHint} />
            {showBirthday && (
              <div className="row birthday">
                <div className="field-group">
                  <label htmlFor={uid + "day"} className="label">{t.edit.day}</label>
                  <select id={uid + "day"} className="select" value={Math.min(day, longest)} onChange={e => setDay(Number(e.target.value))}>
                    {Array.from({ length: longest }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label htmlFor={uid + "month"} className="label">{t.edit.month}</label>
                  <select id={uid + "month"} className="select" value={month} onChange={e => setMonth(Number(e.target.value))}>
                    {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </fieldset>
      )}

      {job && !own && (
        <fieldset className="card-block">
          <legend>{t.edit.aboutThem}</legend>
          <div className="field-group">
            <label htmlFor={uid + "phone"} className="label">{t.edit.phone}</label>
            <input id={uid + "phone"} name="phone" className="field" type="tel" inputMode="tel" defaultValue={job.phone} maxLength={limits.phone} placeholder={t.edit.phoneHint} />
          </div>
        </fieldset>
      )}

      {job ? (
        <fieldset className="card-block">
          <legend>{t.edit.job}</legend>
          <div className="grid-2">
            <div className="field-group">
              <label htmlFor={uid + "title"} className="label">{t.edit.title}</label>
              <input id={uid + "title"} name="title" className="field" defaultValue={job.title} maxLength={limits.title} list={uid + "titles"} autoComplete="off" />
              <datalist id={uid + "titles"}>{known.titles.map(x => <option key={x} value={x} />)}</datalist>
            </div>
            <div className="field-group">
              <label htmlFor={uid + "team"} className="label">{t.edit.team}</label>
              <input id={uid + "team"} name="team" className="field" defaultValue={job.team} maxLength={limits.team} list={uid + "teams"} autoComplete="off" />
              <datalist id={uid + "teams"}>{known.teams.map(x => <option key={x} value={x} />)}</datalist>
            </div>
            <div className="field-group">
              <label htmlFor={uid + "office"} className="label">{t.edit.office}</label>
              <input id={uid + "office"} name="office" className="field" defaultValue={job.office} maxLength={limits.office} list={uid + "offices"} autoComplete="off" />
              <datalist id={uid + "offices"}>{known.offices.map(x => <option key={x} value={x} />)}</datalist>
            </div>
            <div className="field-group">
              <PeoplePicker label={t.edit.manager} hint={t.leaveEmpty} clearable value={manager} onChange={setManager} search={searchManagers} suggestions={offered(managers)} labels={t.peoplePicker} lang={lang} />
            </div>
            <div className="field-group">
              <WatchedDateField label={t.edit.startDate} value={startDate} onChange={setStartDate} onProblem={refused.watch("startDate")} today={today} min="1950-01-01" max="2100-12-31" chips={false} labels={t.date} />
            </div>
          </div>
        </fieldset>
      ) : (
        <div className="card-block readonly">
          <h2 className="legend">{t.edit.job}</h2>
          <dl className="grid-2">
            {jobView.title && <div><dt>{t.edit.title}</dt><dd>{jobView.title}</dd></div>}
            {jobView.team && <div><dt>{t.edit.team}</dt><dd>{jobView.team}</dd></div>}
            {jobView.office && <div><dt>{t.edit.office}</dt><dd>{jobView.office}</dd></div>}
          </dl>
          <p className="hint">{t.edit.jobHint}</p>
        </div>
      )}

      {extras.length > 0 && (
        <fieldset className="card-block">
          <legend>{t.edit.more}</legend>
          <div className="grid-2">
            {extras.map(x => x.editable ? (
              x.kind === "date" ? (
                <div key={x.id} className="field-group">
                  <WatchedDateField label={x.label} value={dates[x.id] ?? null} onChange={v => setDates(d => ({ ...d, [x.id]: v }))} onProblem={refused.watch("x-" + x.id)} today={today} min="1950-01-01" max="2100-12-31" chips={false} labels={t.date} />
                </div>
              ) : x.kind === "choice" ? (
                <div key={x.id} className="field-group">
                  <label htmlFor={uid + "x" + x.id} className="label">{x.label}</label>
                  <select id={uid + "x" + x.id} name={"x-" + x.id} className="field" defaultValue={x.value}>
                    <option value="">—</option>
                    {[...x.options, ...(x.value && !x.options.includes(x.value) ? [x.value] : [])].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ) : (
                <div key={x.id} className="field-group">
                  <label htmlFor={uid + "x" + x.id} className="label">{x.label}</label>
                  <input id={uid + "x" + x.id} name={"x-" + x.id} className="field" defaultValue={x.value} maxLength={limits.fieldValue} />
                </div>
              )
            ) : x.value ? (
              <div key={x.id} className="field-group readonly-field"><span className="label">{x.label}</span><span>{x.shown}</span></div>
            ) : null)}
          </div>
          <p className="hint">{t.edit.moreHint}</p>
        </fieldset>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button type="submit" className="button" disabled={pending || refused.problem !== null}>{pending ? t.edit.saving : t.edit.save}</button>
        <button type="button" className="button quiet" onClick={() => void navigate(`/chest/people/${person.id}`)}>{t.edit.cancel}</button>
      </div>
    </form>
  );
}
