import { PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type DateWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { call, fill as format, navigate, toast } from "@argentic/chest-app/client";
import { useMemo, useState, type FormEvent } from "react";
import { useBusy } from "../components/busy.ts";
import { useDateProblems, WatchedDateField } from "../components/date-problems.tsx";
import { KindBadge } from "../components/kind.tsx";
import { offered } from "../shared/choices.ts";
import { daysBetween, isWeekend, welcomeLateDays, type Kind } from "../shared/model.ts";

// Whether the welcome email would leave (lib/mailing.ts, told by the page).
type MailState = "ready" | "later" | "off" | "unknown";

// Someone a checklist can be for: a member, or an expected arrival.
type Pickable = { id: string; name: string; startDate: string | null; managerId?: string | null; detail?: string };
type Words = {
  start: { person: string; template: string; firstDay: string; lastDay: string; submit: string; starting: string; told: string; welcome: string; welcomed: string; noMail: string; mailPaused: string; noAddress: string; manager: string; weekend: string };
  // "Arriving (not in the Chest yet)": said beside an expected arrival.
  group: string;
  date: DateWords;
  peoplePicker: PeoplePickerWords;
  leaveEmpty: string;
  kinds: Record<Kind, string>;
};

// An arrival told by Hiring is "arrival:<id>" in the person picker (offered
// first, said as such): not a member yet, so HR names their manager-to-be
// here.
export function StartForm({ people, arrivals, templates, initial, today, weekdays, lang, mailing, t }: {
  people: { id: string; name: string; startDate: string | null }[];
  // mailable: HR gave the arrival a work email (the welcome's only address).
  arrivals: { id: string; name: string; startDate: string | null; managerId: string | null; mailable: boolean }[];
  templates: { id: string; name: string; kind: Kind; steps: number }[];
  initial: { person: string; kind: Kind; template: string };
  today: string;
  // The names of the days, Sunday first, in the reader's language.
  weekdays: string[];
  lang: string;
  // Whether the welcome email would leave (lib/mailing.ts): the form never
  // promises one the Chest cannot send.
  mailing: MailState;
  t: Words;
}) {
  const [pending, run] = useBusy();
  const [error, setError] = useState<string | null>(null);
  const everyone = useMemo<Pickable[]>(() => [...arrivals.map(a => ({ ...a, detail: t.group })), ...people], [arrivals, people, t.group]);
  const searchEveryone = useMemo(() => localSearch(everyone), [everyone]);
  const searchPeople = useMemo(() => localSearch(people), [people]);
  const [picked, setPicked] = useState<Pickable[]>(() => everyone.filter(p => p.id === initial.person));
  const person = picked[0]?.id ?? "";
  const firstOfKind = templates.find(x => x.kind === initial.kind) ?? templates[0]!;
  const [templateId, setTemplateId] = useState(templates.some(x => x.id === initial.template) ? initial.template : firstOfKind.id);
  const chosen = templates.find(x => x.id === templateId)!;
  const arrival = arrivals.find(a => a.id === person);
  const [manager, setManager] = useState<Pickable[]>(() => people.filter(p => p.id === arrival?.managerId));
  const startDate = everyone.find(p => p.id === person)?.startDate ?? null;
  const [anchor, setAnchor] = useState<string | null>(chosen.kind === "onboarding" && startDate ? startDate : today);
  const [touched, setTouched] = useState(false);
  // A day refused by the field (before 2000, after 2100, unreadable) leaves
  // the previous one in `anchor`: the checklist waits (kit 0.2.4).
  const dates = useDateProblems();
  // What the form says of the welcome email, before starting: only for an
  // arrival checklist whose first day is not long past (lib/welcome.ts).
  const named = picked[0]?.name ?? "";
  const welcomeLine = chosen.kind !== "onboarding" || !person || !anchor || daysBetween(anchor, today) > welcomeLateDays || mailing === "unknown" ? null
    : arrival && !arrival.mailable ? format(t.start.noAddress, { name: named })
    : mailing === "off" ? format(t.start.noMail, { name: named })
    : mailing === "later" ? format(t.start.mailPaused, { name: named })
    : format(t.start.welcome, { name: named });
  const weekend = anchor && isWeekend(anchor) ? weekdays[new Date(anchor + "T00:00:00Z").getUTCDay()]! : null;
  const suggest = (p: string, tid: string) => {
    if (touched) return;
    const k = templates.find(x => x.id === tid)?.kind;
    const s = everyone.find(x => x.id === p)?.startDate ?? null;
    setAnchor(k === "onboarding" && s ? s : today);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dates.problem) return;
    setError(null);
    void run(async () => {
      const result = await call("startChecklist", arrival ? { arrivalId: arrival.id.slice("arrival:".length), managerId: manager[0]?.id ?? null, templateId, anchor: anchor ?? "" } : { personId: person, templateId, anchor: anchor ?? "" }, { refresh: false, quiet: true });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast({ id: "started", text: result.value.welcomed ? format(t.start.welcomed, { name: picked[0]?.name ?? "" }) : t.start.told });
      await navigate(`/chest/checklists/${result.value.id}`);
    });
  };
  return (
    <form className="form card-block" onSubmit={submit}>
      <div className="field-group">
        <PeoplePicker label={t.start.person} required value={picked} search={searchEveryone} suggestions={arrivals.length > 0 ? everyone.slice(0, arrivals.length) : offered(people)} labels={t.peoplePicker} lang={lang}
          onChange={chosen => {
            setPicked(chosen);
            const id = chosen[0]?.id ?? "";
            setManager(people.filter(p => p.id === arrivals.find(a => a.id === id)?.managerId));
            suggest(id, templateId);
          }} />
      </div>
      {arrival && (
        <div className="field-group">
          <PeoplePicker label={t.start.manager} hint={t.leaveEmpty} clearable value={manager} onChange={setManager} search={searchPeople} suggestions={offered(people)} labels={t.peoplePicker} lang={lang} />
        </div>
      )}
      <fieldset className="field-group">
        <legend className="label">{t.start.template}</legend>
        <div className="choices">
          {templates.map(x => (
            <label key={x.id} className="choice">
              <input type="radio" name="template" value={x.id} checked={x.id === templateId} onChange={() => { setTemplateId(x.id); suggest(person, x.id); }} />
              <KindBadge kind={x.kind} label={t.kinds[x.kind]} />
              <strong>{x.name}</strong>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field-group">
        <WatchedDateField label={chosen.kind === "onboarding" ? t.start.firstDay : t.start.lastDay} value={anchor} required min="2000-01-01" max="2100-12-31" today={today} labels={t.date}
          onProblem={dates.watch("anchor")} onChange={day => { setAnchor(day); setTouched(true); }} />
        <p className="hint warn-hint" role="status">{weekend ? format(t.start.weekend, { day: weekend }) : ""}</p>
      </div>
      <p className="hint">{t.start.told}</p>
      {welcomeLine && <p className="hint" data-welcome={mailing === "ready" && !(arrival && !arrival.mailable) ? "yes" : "no"}>{welcomeLine}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button type="submit" className="button" disabled={pending || !person || !anchor || dates.problem !== null}>{pending ? t.start.starting : t.start.submit}</button>
      </div>
    </form>
  );
}
