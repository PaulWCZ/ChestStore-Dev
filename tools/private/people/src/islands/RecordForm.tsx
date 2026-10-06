import { Confirm, PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type Choice, type DateWords, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { call, navigate, toast } from "@argentic/chest-app/client";
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useBusy } from "../components/busy.ts";
import { useDateProblems, WatchedDateField } from "../components/date-problems.tsx";
import { Trash } from "../components/icons.tsx";
import { contracts, limits, sexes, type Contract } from "../shared/model.ts";

type Field =
  | "legalName" | "sex" | "birthDate" | "nationality" | "job" | "qualification" | "contract" | "workingTime" | "hours" | "startDate" | "trialEnd" | "contractEnd" | "endDate"
  | "workPermit" | "agency" | "tutorId" | "workplace" | "emergencyName" | "emergencyRelation" | "emergencyPhone" | "address"
  | "employeeNumber" | "permitEnd" | "workDays";
type Words = {
  record: {
    identity: string; contract: string; emergency: string; fields: Record<Field, string>;
    hints: { legalName: string; qualification: string; workPermit: string; agency: string; register: string; permitEnd: string; employeeNumber: string; workDays: string };
    weekDays: readonly string[];
    contracts: Record<Contract, string>; sexes: Record<"female" | "male", string>; notSaid: string; workingTimes: { full: string; part: string };
    save: string; saving: string; saved: string; noChange: string; link: string; linkNone: string; linked: string;
    delete: string; deleteHint: string; deleted: string; deleteTitle: string; deleteBody: string; deleteConfirm: string; cancel: string;
  };
  date: DateWords;
  peoplePicker: PeoplePickerWords;
  leaveEmpty: string;
};

// HR's form for one record: identity (as the staff register needs it),
// contract, emergency contact. Saved in one click; a refusal says why and
// keeps what was typed. Fields the register needs are marked. The page
// gives the island an id of the record's version: a record saved (here or
// by someone else) comes back as a fresh form with what is stored.
export function RecordForm({ id, initial, linked, erased, members, today, lang, t }: {
  id: string;
  initial: Record<Field, string>;
  linked: string | null;
  erased: boolean;
  members: { id: string; name: string; photo: string | null }[];
  // Today in the Chest's time zone (the date fields), the words' language.
  today: string;
  lang: string;
  t: Words;
}) {
  const uid = useId();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useBusy();
  const searchMembers = useMemo(() => localSearch(members), [members]);
  // A day refused by its field (kit 0.2.4) leaves the previous one in
  // `values`: the record (noValidate: the browser does not stop it) waits.
  const dates = useDateProblems();
  const put = (f: Field, value: string) => setValues(v => ({ ...v, [f]: value }));
  const set = (f: Field) => (e: { target: { value: string } }) => setValues(v => ({ ...v, [f]: e.target.value }));
  const contract = values.contract as Contract;
  const register = t.record.hints.register;

  // A star marks what the staff register needs; the one line saying so is
  // read with each of these fields.
  const described = (f: Field, hint: boolean, needed: boolean) => [hint ? uid + f + "-hint" : "", needed ? uid + "register" : ""].filter(Boolean).join(" ") || undefined;
  const field = (f: Field, control: ReactNode, hint?: string, needed = false) => (
    <div className="field-group">
      <label htmlFor={uid + f} className="label">{t.record.fields[f]}{needed && <span className="needed" aria-hidden="true"> *</span>}</label>
      {control}
      {hint && <p id={uid + f + "-hint"} className="hint">{hint}</p>}
    </div>
  );
  const text = (f: Field, max: number, needed = false, hint?: string, type = "text") =>
    field(f, <input id={uid + f} className="field" type={type} value={values[f]} onChange={set(f)} maxLength={max} autoComplete="off" aria-describedby={described(f, Boolean(hint), needed)} />, hint, needed);
  // A date: the kit's field (typed as people write dates, or chosen on a
  // calendar). Its label is a string, so what the register needs is marked
  // by a star in the words themselves.
  const date = (f: Field, needed = false, hint?: string) => (
    <div className="field-group">
      <WatchedDateField label={t.record.fields[f] + (needed ? " *" : "")} {...(hint ? { hint } : {})} value={values[f] || null} onChange={day => put(f, day ?? "")} onProblem={dates.watch(f)} today={today} min="1900-01-01" max="2100-12-31" chips={false} labels={t.date} />
    </div>
  );
  // The days a part-timer works: one box per day of the week (ISO 1–7).
  const days = new Set(values.workDays.split(",").filter(Boolean).map(Number));
  const toggleDay = (n: number) => {
    const next = new Set(days);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    put("workDays", [...next].sort((a, b) => a - b).join(","));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dates.problem) return;
    const changed = Object.fromEntries((Object.keys(values) as Field[]).filter(f => values[f] !== initial[f]).map(f => [f, values[f] === "" && ["sex", "tutorId", "hours", "workDays"].includes(f) ? null : values[f]]));
    setError(null);
    void run(async () => {
      const r = await call("saveRecord", { id, input: changed }, { quiet: true });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      toast({ id: `record-${id}`, text: r.value.changed.length > 0 ? t.record.saved : t.record.noChange });
    });
  };
  const intern = contract === "internship";
  return (
    <>
      <form className="form" onSubmit={submit} noValidate>
        <p id={uid + "register"} className="hint"><span className="needed" aria-hidden="true">* </span>{register}</p>
        <fieldset className="card-block">
          <legend>{t.record.identity}</legend>
          <div className="grid-2">
            {text("legalName", limits.name, true, t.record.hints.legalName)}
            {field("sex", (
              <select id={uid + "sex"} className="select" value={values.sex} onChange={set("sex")} aria-describedby={described("sex", false, !intern)}>
                <option value="">{t.record.notSaid}</option>
                {sexes.map(s => <option key={s} value={s}>{t.record.sexes[s]}</option>)}
              </select>
            ), undefined, !intern)}
            {date("birthDate", !intern)}
            {text("nationality", limits.nationality, !intern)}
            {text("workPermit", limits.workPermit, false, t.record.hints.workPermit)}
            {(values.workPermit !== "" || values.permitEnd !== "") && date("permitEnd", false, t.record.hints.permitEnd)}
            {field("address", <textarea id={uid + "address"} className="field" rows={3} value={values.address} onChange={set("address")} maxLength={limits.address} />)}
          </div>
        </fieldset>

        <fieldset className="card-block">
          <legend>{t.record.contract}</legend>
          <div className="grid-2">
            {field("contract", (
              <select id={uid + "contract"} className="select" value={values.contract} onChange={set("contract")}>
                {contracts.map(c => <option key={c} value={c}>{t.record.contracts[c]}</option>)}
              </select>
            ))}
            {text("employeeNumber", limits.employeeNumber, false, t.record.hints.employeeNumber)}
            {text("job", limits.title, !intern)}
            {text("qualification", limits.qualification, !intern, t.record.hints.qualification)}
            {field("workingTime", (
              <select id={uid + "workingTime"} className="select" value={values.workingTime} onChange={set("workingTime")}>
                <option value="full">{t.record.workingTimes.full}</option>
                <option value="part">{t.record.workingTimes.part}</option>
              </select>
            ))}
            {text("hours", 5, false, undefined, "text")}
            {(values.workingTime === "part" || values.workDays !== "") && (
              <div className="field-group week-days" role="group" aria-labelledby={uid + "workDays"} aria-describedby={uid + "workDays-hint"}>
                <span id={uid + "workDays"} className="label">{t.record.fields.workDays}</span>
                <div className="day-chips">
                  {t.record.weekDays.map((name, i) => (
                    <label key={name} className="check-chip">
                      <input type="checkbox" checked={days.has(i + 1)} onChange={() => toggleDay(i + 1)} />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
                <p id={uid + "workDays-hint"} className="hint">{t.record.hints.workDays}</p>
              </div>
            )}
            {date("startDate", true)}
            {date("trialEnd")}
            {contract !== "permanent" && date("contractEnd", intern)}
            {date("endDate")}
            {(contract === "temporary" || contract === "seconded") && field("agency", <textarea id={uid + "agency"} className="field" rows={2} value={values.agency} onChange={set("agency")} maxLength={limits.agency} aria-describedby={described("agency", true, true)} />, t.record.hints.agency, true)}
            {intern && (
              <div className="field-group">
                <PeoplePicker label={t.record.fields.tutorId + " *"} value={members.filter(m => m.id === values.tutorId)} onChange={c => put("tutorId", c[0]?.id ?? "")} search={searchMembers} labels={t.peoplePicker} lang={lang} />
              </div>
            )}
            {intern && text("workplace", limits.workplace, true)}
          </div>
        </fieldset>

        <fieldset className="card-block">
          <legend>{t.record.emergency}</legend>
          <div className="grid-2">
            {text("emergencyName", limits.name)}
            {text("emergencyRelation", limits.relation)}
            {text("emergencyPhone", limits.phone, false, undefined, "tel")}
          </div>
        </fieldset>

        {error && <p className="error" role="alert">{error}</p>}
        <div className="row form-actions sticky-actions">
          <button type="submit" className="button" disabled={pending || dates.problem !== null}>{pending ? t.record.saving : t.record.save}</button>
        </div>
      </form>

      {!erased && <LinkMember id={id} linked={linked} members={members} search={searchMembers} lang={lang} t={t} />}
    </>
  );
}

// Which Chest account the record is about (someone who got the Chest after
// HR wrote their record), and deleting a record made by mistake.
function LinkMember({ id, linked, members, search, lang, t }: { id: string; linked: string | null; members: { id: string; name: string; photo: string | null }[]; search: (q: string) => Promise<Choice[]>; lang: string; t: Words }) {
  const [who, setWho] = useState<Choice[]>(() => members.filter(m => m.id === linked));
  const [asking, setAsking] = useState(false);
  const [pending, run] = useBusy();
  return (
    <section className="card-block section record-admin">
      <div className="field-group link-select">
        <PeoplePicker label={t.record.link} hint={t.record.linkNone} value={who} disabled={pending} search={search} labels={t.peoplePicker} lang={lang}
          onChange={next => {
            setWho(next);
            void run(async () => {
              const r = await call("linkRecord", { id, memberId: next[0]?.id ?? null });
              if (!r.ok) setWho(members.filter(m => m.id === linked));
              else toast({ id: `record-${id}`, text: t.record.linked });
            });
          }} />
      </div>
      <div className="row">
        <button type="button" className="button quiet small danger" disabled={pending} onClick={() => setAsking(true)}><Trash />{t.record.delete}</button>
        <span className="hint">{t.record.deleteHint}</span>
      </div>
      <Confirm open={asking} title={t.record.deleteTitle} body={t.record.deleteBody} confirmLabel={t.record.deleteConfirm} cancelLabel={t.record.cancel} onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          void run(async () => {
            const r = await call("deleteRecord", { id }, { refresh: false });
            if (r.ok) {
              toast({ id: `record-${id}`, text: t.record.deleted });
              await navigate("/chest/records");
            }
          });
        }} />
    </section>
  );
}
