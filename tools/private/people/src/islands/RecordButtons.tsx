import { Checkbox, PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type Choice, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { call, navigate, plural, toast } from "@argentic/chest-app/client";
import { useId, useMemo, useState, type FormEvent } from "react";
import { useBusy } from "../components/busy.ts";
import { Folder, Plus } from "../components/icons.tsx";
import { offered } from "../shared/choices.ts";
import { limits } from "../shared/model.ts";

type Words = {
  records: {
    add: string; addFor: string; addSomeoneElse: string; legalName: string; create: string; creating: string; cancel: string;
    createAll: { one: string; other: string }; createdAll: { zero?: string; one: string; other: string };
  };
  peoplePicker?: PeoplePickerWords;
};

// "Create their 12 records": one per person in the directory who has none,
// filled with what People knows (name, job, first day) for HR to complete.
export function CreateAll({ count, locale, t }: { count: number; locale: string; t: Words }) {
  const [pending, run] = useBusy();
  return (
    <button type="button" className="button" disabled={pending} onClick={() => void run(async () => {
      const r = await call("createAllRecords", {});
      if (r.ok) toast({ id: "records-created", text: plural(locale, t.records.createdAll, r.value) });
    })}><Folder />{plural(locale, t.records.createAll, count)}</button>
  );
}

// One record: for someone in the directory (a person picker), or for
// someone without the Chest (a name as on the contract).
export function AddRecord({ people, lang, t }: { people: { id: string; name: string; photo: string | null }[]; lang: string; t: Words }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Choice[]>([]);
  const [outside, setOutside] = useState(people.length === 0);
  const searchPeople = useMemo(() => localSearch(people), [people]);
  const [pending, run] = useBusy();
  if (!open) return <button type="button" className="button quiet" onClick={() => setOpen(true)}><Plus />{t.records.add}</button>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const r = await call("createRecord", !outside && who[0] ? { memberId: who[0].id } : { legalName: String(data.get("legalName") ?? "") }, { refresh: false });
      if (r.ok) await navigate(`/chest/records/${r.value.id}`);
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
        <Checkbox label={t.records.addSomeoneElse} checked={outside} onChange={setOutside} />
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
