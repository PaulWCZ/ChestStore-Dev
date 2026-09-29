"use client";

import { PeoplePicker, useToast } from "@argentic/chest-ui/components";
import { localSearch, type Choice, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { Folder, Plus } from "../../../components/icons.tsx";
import { offered } from "../../../lib/choices.ts";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import { limits } from "../../../lib/model.ts";
import { createAllRecords, createRecord } from "../actions.ts";

type Words = {
  records: {
    add: string; addFor: string; addSomeoneElse: string; legalName: string; create: string; creating: string; cancel: string;
    createAll: { one: string; other: string }; createdAll: { zero?: string; one: string; other: string };
  };
  errors: Record<ErrorCode, string>;
  peoplePicker?: PeoplePickerWords;
};

// "Create their 12 records": one per person in the directory who has none,
// filled with what People knows (name, job, first day) for HR to complete.
export function CreateAll({ count, locale, t }: { count: number; locale: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="button" disabled={pending} onClick={() => start(async () => {
      const r = await createAllRecords();
      if (!r.ok) toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
      else {
        toast(plural(t.records.createdAll, r.value, locale));
        router.refresh();
      }
    })}><Folder />{plural(t.records.createAll, count, locale)}</button>
  );
}

// One record: for someone in the directory (a person picker), or for
// someone without the Chest (a name as on the contract).
export function AddRecord({ people, lang, t }: { people: { id: string; name: string; photo: string | null }[]; lang: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Choice[]>([]);
  const [outside, setOutside] = useState(people.length === 0);
  const searchPeople = useMemo(() => localSearch(people), [people]);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="button quiet" onClick={() => setOpen(true)}><Plus />{t.records.add}</button>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    start(async () => {
      const r = await createRecord(!outside && who[0] ? { memberId: who[0].id } : { legalName: String(data.get("legalName") ?? "") });
      if (!r.ok) {
        toast({ text: format(t.errors[r.error], r.values ?? {}), tone: "error" });
        return;
      }
      router.push(`/chest/records/${r.value.id}`);
    });
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      {!outside && t.peoplePicker && (
        <div className="field-group">
          <PeoplePicker label={t.records.addFor} value={who} onChange={setWho} search={searchPeople} suggestions={offered(people)} labels={t.peoplePicker} lang={lang} />
        </div>
      )}
      {people.length > 0 && (
        <label className="check">
          <input type="checkbox" checked={outside} onChange={e => setOutside(e.target.checked)} />
          <span>{t.records.addSomeoneElse}</span>
        </label>
      )}
      {outside && (
        <div className="field-group">
          <label htmlFor={uid + "name"} className="label">{t.records.legalName}</label>
          <input id={uid + "name"} name="legalName" className="field" required maxLength={limits.name} autoComplete="off" autoFocus />
        </div>
      )}
      <div className="row">
        <button type="submit" className="button" disabled={pending || (!outside && !who[0])}>{pending ? t.records.creating : t.records.create}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.records.cancel}</button>
      </div>
    </form>
  );
}
