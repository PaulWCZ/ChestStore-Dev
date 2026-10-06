import { PeoplePicker, Switch } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { call, toast } from "@argentic/chest-app/client";
import { useId, useMemo, useState, type FormEvent } from "react";
import { useBusy } from "../components/busy.ts";
import { limits } from "../shared/model.ts";

type Words = {
  placement: { title: string; body: string; listed: string; team: string; manager: string; save: string; saving: string; saved: string };
  peoplePicker: PeoplePickerWords;
  leaveEmpty: string;
};

// Someone without the Chest, in the directory and the org chart: shown or
// not, their team, their manager. Only what the directory shows of anyone.
export function PlacementForm({ id, initial, members, teams, lang, t }: {
  id: string;
  initial: { listed: boolean; team: string; managerId: string | null };
  members: { id: string; name: string; photo: string | null }[];
  teams: string[];
  lang: string;
  t: Words;
}) {
  const uid = useId();
  const [listed, setListed] = useState(initial.listed);
  const [team, setTeam] = useState(initial.team);
  const [manager, setManager] = useState(() => members.filter(m => m.id === initial.managerId));
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useBusy();
  const search = useMemo(() => localSearch(members), [members]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    void run(async () => {
      const result = await call("savePlacement", { id, listed, team, managerId: manager[0]?.id ?? null }, { quiet: true });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast({ id: `placement-${id}`, text: t.placement.saved });
    });
  };
  return (
    <section className="card-block section" aria-labelledby={uid + "title"}>
      <h2 id={uid + "title"} className="legend">{t.placement.title}</h2>
      <p className="muted small">{t.placement.body}</p>
      <form className="form" onSubmit={submit}>
        <Switch checked={listed} label={t.placement.listed} onChange={setListed} />
        {listed && (
          <>
            <div className="field-group">
              <label htmlFor={uid + "team"} className="label">{t.placement.team}</label>
              <input id={uid + "team"} className="field" value={team} onChange={e => setTeam(e.target.value)} maxLength={limits.team} list={uid + "teams"} autoComplete="off" />
              <datalist id={uid + "teams"}>{teams.map(x => <option key={x} value={x} />)}</datalist>
            </div>
            <div className="field-group">
              <PeoplePicker label={t.placement.manager} hint={t.leaveEmpty} clearable value={manager} onChange={setManager} search={search} labels={t.peoplePicker} lang={lang} />
            </div>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row form-actions">
          <button type="submit" className="button" disabled={pending}>{pending ? t.placement.saving : t.placement.save}</button>
        </div>
      </form>
    </section>
  );
}
