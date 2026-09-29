"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Trash } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { ErrorCode } from "../../../../lib/app-error.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { contracts, limits, sexes, type Contract } from "../../../../lib/model.ts";
import { deleteRecord, linkRecord, saveRecord } from "../../actions.ts";

type Field =
  | "legalName" | "sex" | "birthDate" | "nationality" | "job" | "qualification" | "contract" | "workingTime" | "hours" | "startDate" | "trialEnd" | "contractEnd" | "endDate"
  | "workPermit" | "agency" | "tutorId" | "workplace" | "emergencyName" | "emergencyRelation" | "emergencyPhone" | "address";
type Words = {
  record: {
    identity: string; contract: string; emergency: string; fields: Record<Field, string>;
    hints: { legalName: string; qualification: string; workPermit: string; agency: string; register: string };
    contracts: Record<Contract, string>; sexes: Record<"female" | "male", string>; notSaid: string; workingTimes: { full: string; part: string };
    nobody: string; save: string; saving: string; saved: string; noChange: string; link: string; linkNone: string; linked: string;
    delete: string; deleteHint: string; deleted: string;
  };
  errors: Record<ErrorCode, string>;
};

// HR's form for one record: identity (as the staff register needs it),
// contract, emergency contact. Saved in one click; a refusal says why and
// keeps what was typed. Fields the register needs are marked.
export function RecordForm({ id, initial, linked, erased, members, t }: {
  id: string;
  initial: Record<Field, string>;
  linked: string | null;
  erased: boolean;
  members: { id: string; name: string }[];
  t: Words;
}) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
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
  const date = (f: Field, needed = false) =>
    field(f, <input id={uid + f} className="field" type="date" value={values[f]} onChange={set(f)} min="1900-01-01" max="2100-12-31" aria-describedby={described(f, false, needed)} />, undefined, needed);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const changed = Object.fromEntries((Object.keys(values) as Field[]).filter(f => values[f] !== initial[f]).map(f => [f, values[f] === "" && ["sex", "tutorId", "hours"].includes(f) ? null : values[f]]));
    setError(null);
    start(async () => {
      const r = await saveRecord(id, changed);
      if (!r.ok) {
        setError(format(t.errors[r.error], r.values ?? {}));
        return;
      }
      toast(r.value.changed.length > 0 ? t.record.saved : t.record.noChange);
      router.refresh();
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
            {text("job", limits.title, !intern)}
            {text("qualification", limits.qualification, !intern, t.record.hints.qualification)}
            {field("workingTime", (
              <select id={uid + "workingTime"} className="select" value={values.workingTime} onChange={set("workingTime")}>
                <option value="full">{t.record.workingTimes.full}</option>
                <option value="part">{t.record.workingTimes.part}</option>
              </select>
            ))}
            {text("hours", 5, false, undefined, "text")}
            {date("startDate", true)}
            {date("trialEnd")}
            {contract !== "permanent" && date("contractEnd", intern)}
            {date("endDate")}
            {(contract === "temporary" || contract === "seconded") && field("agency", <textarea id={uid + "agency"} className="field" rows={2} value={values.agency} onChange={set("agency")} maxLength={limits.agency} aria-describedby={described("agency", true, true)} />, t.record.hints.agency, true)}
            {intern && field("tutorId", (
              <select id={uid + "tutorId"} className="select" value={values.tutorId} onChange={set("tutorId")} aria-describedby={described("tutorId", false, true)}>
                <option value="">{t.record.nobody}</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ), undefined, true)}
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
          <button type="submit" className="button" disabled={pending}>{pending ? t.record.saving : t.record.save}</button>
        </div>
      </form>

      {!erased && <LinkMember id={id} linked={linked} members={members} t={t} />}
    </>
  );
}

// Which Chest account the record is about (someone who got the Chest after
// HR wrote their record), and deleting a record made by mistake.
function LinkMember({ id, linked, members, t }: { id: string; linked: string | null; members: { id: string; name: string }[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [who, setWho] = useState(linked ?? "");
  const [pending, start] = useTransition();
  return (
    <section className="card-block section record-admin">
      <div className="field-group">
        <label htmlFor={uid + "link"} className="label">{t.record.link}</label>
        <div className="row">
          <select id={uid + "link"} className="select link-select" value={who} disabled={pending} onChange={e => {
            const next = e.target.value;
            setWho(next);
            start(async () => {
              const r = await linkRecord(id, next || null);
              if (!r.ok) { setWho(linked ?? ""); toast(format(t.errors[r.error], r.values ?? {})); }
              else { toast(t.record.linked); router.refresh(); }
            });
          }}>
            <option value="">{t.record.linkNone}</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <button type="button" className="button quiet small danger" disabled={pending} onClick={() => start(async () => {
          const r = await deleteRecord(id);
          if (!r.ok) toast(format(t.errors[r.error], r.values ?? {}));
          else { toast(t.record.deleted); router.push("/chest/records"); }
        })}><Trash />{t.record.delete}</button>
        <span className="hint">{t.record.deleteHint}</span>
      </div>
    </section>
  );
}
