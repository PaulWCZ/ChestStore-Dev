import { PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type Choice, type DateWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { call, fill, toast } from "@argentic/chest-app/client";
import { useId, useMemo, useState, type FormEvent } from "react";
import { useBusy } from "../components/busy.ts";
import { useDateProblems, WatchedDateField } from "../components/date-problems.tsx";
import { Pencil, Plus } from "../components/icons.tsx";
import { offered } from "../shared/choices.ts";
import { isWeekend, limits } from "../shared/model.ts";

// "Someone is joining": HR writes an arrival by hand — a hire made outside
// the Hiring tool — to prepare it before day 1. The same arrival Hiring's
// event makes: its checklist, the link to the member once they have access.
export type ArrivalDraft = { id?: string; name: string; job: string; team: string; place: string; startDate: string | null; managerId: string | null; workEmail: string };
type Words = {
  arrivals: {
    add: string; addTitle: string; editTitle: string; edit: string; name: string; job: string; team: string; office: string; startDate: string; manager: string;
    workEmail: string; workEmailHint: string; save: string; saving: string; added: string; saved: string; cancel: string; weekend: string;
  };
  date: DateWords;
  peoplePicker: PeoplePickerWords;
  leaveEmpty: string;
};

export type ArrivalFormProps = {
  draft?: ArrivalDraft;
  people: { id: string; name: string }[];
  known: { teams: string[]; offices: string[]; titles: string[] };
  // The names of the days, Sunday first, in the reader's language.
  weekdays: string[];
  // Today in the Chest's time zone (the date field), the words' language.
  today: string;
  lang: string;
  t: Words;
};

export function ArrivalForm({ draft, people, known, weekdays, today, lang, t }: ArrivalFormProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useBusy();
  const [startDate, setStartDate] = useState<string | null>(draft?.startDate ?? null);
  const [manager, setManager] = useState<Choice[]>(() => people.filter(p => p.id === draft?.managerId));
  // A start day refused by its field (kit 0.2.4) leaves the previous one in
  // `startDate`: the form (noValidate: the browser does not stop it) waits.
  const dates = useDateProblems();
  const searchPeople = useMemo(() => localSearch(people), [people]);
  const weekend = startDate && isWeekend(startDate) ? weekdays[new Date(startDate + "T00:00:00Z").getUTCDay()]! : null;

  if (!open) {
    return draft
      ? <button type="button" className="button quiet small" onClick={() => setOpen(true)}><Pencil />{t.arrivals.edit}</button>
      : <button type="button" className="button quiet" onClick={() => setOpen(true)}><Plus />{t.arrivals.add}</button>;
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dates.problem) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "");
    const input = { name: text("name"), job: text("job"), team: text("team"), place: text("place"), startDate, managerId: manager[0]?.id ?? null, workEmail: text("workEmail") };
    setError(null);
    void run(async () => {
      const r = draft?.id ? await call("updateArrival", { id: draft.id, input }, { quiet: true }) : await call("addArrival", { input }, { quiet: true });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      toast({ id: "arrival-saved", text: draft?.id ? t.arrivals.saved : t.arrivals.added });
      setOpen(false);
    });
  };
  return (
    <form className="form card-block arrival-form" onSubmit={submit} noValidate>
      <h3>{draft?.id ? t.arrivals.editTitle : t.arrivals.addTitle}</h3>
      <div className="grid-2">
        <div className="field-group">
          <label htmlFor={uid + "name"} className="label">{t.arrivals.name}</label>
          <input id={uid + "name"} name="name" className="field" required defaultValue={draft?.name ?? ""} maxLength={limits.name} autoComplete="off" autoFocus />
        </div>
        <div className="field-group">
          <WatchedDateField label={t.arrivals.startDate} value={startDate} onChange={setStartDate} onProblem={dates.watch("startDate")} today={today} min="2000-01-01" max="2100-12-31" chips={false} labels={t.date} />
          <p className="hint warn-hint" role="status">{weekend ? fill(t.arrivals.weekend, { day: weekend }) : ""}</p>
        </div>
        <div className="field-group">
          <label htmlFor={uid + "job"} className="label">{t.arrivals.job}</label>
          <input id={uid + "job"} name="job" className="field" defaultValue={draft?.job ?? ""} maxLength={limits.title} list={uid + "titles"} autoComplete="off" />
          <datalist id={uid + "titles"}>{known.titles.map(x => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="field-group">
          <label htmlFor={uid + "team"} className="label">{t.arrivals.team}</label>
          <input id={uid + "team"} name="team" className="field" defaultValue={draft?.team ?? ""} maxLength={limits.team} list={uid + "teams"} autoComplete="off" />
          <datalist id={uid + "teams"}>{known.teams.map(x => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="field-group">
          <label htmlFor={uid + "place"} className="label">{t.arrivals.office}</label>
          <input id={uid + "place"} name="place" className="field" defaultValue={draft?.place ?? ""} maxLength={limits.office} list={uid + "offices"} autoComplete="off" />
          <datalist id={uid + "offices"}>{known.offices.map(x => <option key={x} value={x} />)}</datalist>
        </div>
        <div className="field-group">
          <PeoplePicker label={t.arrivals.manager} hint={t.leaveEmpty} clearable value={manager} onChange={setManager} search={searchPeople} suggestions={offered(people)} labels={t.peoplePicker} lang={lang} />
        </div>
        <div className="field-group">
          <label htmlFor={uid + "email"} className="label">{t.arrivals.workEmail}</label>
          <input id={uid + "email"} name="workEmail" className="field" type="email" inputMode="email" defaultValue={draft?.workEmail ?? ""} maxLength={limits.email} autoComplete="off" aria-describedby={uid + "email-hint"} />
          <p id={uid + "email-hint"} className="hint">{t.arrivals.workEmailHint}</p>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button type="submit" className="button" disabled={pending || dates.problem !== null}>{pending ? t.arrivals.saving : t.arrivals.save}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.arrivals.cancel}</button>
      </div>
    </form>
  );
}
