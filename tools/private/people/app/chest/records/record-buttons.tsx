"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Folder, Plus } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
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
      if (!r.ok) toast(format(t.errors[r.error], r.values ?? {}));
      else {
        toast(plural(t.records.createdAll, r.value, locale));
        router.refresh();
      }
    })}><Folder />{plural(t.records.createAll, count, locale)}</button>
  );
}

// One record: for someone in the directory, or for someone without the
// Chest (a name as on the contract).
export function AddRecord({ people, t }: { people: { id: string; name: string }[]; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(people[0]?.id ?? "");
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="button quiet" onClick={() => setOpen(true)}><Plus />{t.records.add}</button>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    start(async () => {
      const r = await createRecord(who ? { memberId: who } : { legalName: String(data.get("legalName") ?? "") });
      if (!r.ok) {
        toast(format(t.errors[r.error], r.values ?? {}));
        return;
      }
      router.push(`/chest/records/${r.value.id}`);
    });
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor={uid + "who"} className="label">{t.records.addFor}</label>
        <select id={uid + "who"} className="select" value={who} onChange={e => setWho(e.target.value)}>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">{t.records.addSomeoneElse}</option>
        </select>
      </div>
      {!who && (
        <div className="field-group">
          <label htmlFor={uid + "name"} className="label">{t.records.legalName}</label>
          <input id={uid + "name"} name="legalName" className="field" required maxLength={limits.name} autoComplete="off" autoFocus />
        </div>
      )}
      <div className="row">
        <button type="submit" className="button" disabled={pending}>{pending ? t.records.creating : t.records.create}</button>
        <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.records.cancel}</button>
      </div>
    </form>
  );
}
