import { call, navigate } from "@argentic/chest-app/client";
import { PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useId, useState } from "react";
import { Alert, Plus, Trash } from "../components/icons.tsx";
import { emptyDraft, KeyResultFields, krInput, type Board, type KrDraft, type Owner } from "../components/key-result-fields.tsx";
import type { Catalogue } from "../i18n/index.ts";

type Level = "company" | "team" | "personal";
export type FormWords = { form: Catalogue["form"]; tools: Catalogue["tools"]; kinds: Catalogue["kinds"]; kindHints: Catalogue["kindHints"]; levels: Catalogue["levels"]; errors: Catalogue["errors"]; visibility: Catalogue["visibility"]; peoplePicker: PeoplePickerWords };
type Visibility = "everyone" | "team" | "people";
export type Choice = { id: string; name: string };
export type ParentChoice = { id: string; title: string; level: Level; team: string | null };

type Props = {
  mode: "new" | "edit";
  objectiveId: string | null;
  cycleId: string;
  levels: Level[];                // the levels this person may write
  teams: (Choice & { writable: boolean; group: boolean })[];
  parents: ParentChoice[];
  owners: Owner[];
  me: string;
  initial: { level: Level; teamId: string; parentId: string; owner: string; title: string; why: string; visibility: Visibility; viewers: string[] };
  personalNote: boolean;
  locale: string;
  currency: string;
  t: FormWords;
};

// A new objective (with its first key results), or an objective's own
// fields when editing. Levels, teams and what it may support are only
// those the person may choose.
export function ObjectiveForm({ mode, objectiveId, cycleId, levels, teams, parents, owners, me, initial, personalNote, locale, currency, t, boards }: Props & { boards: Board[] }) {
  const uid = useId();
  const f = t.form;
  const [level, setLevel] = useState<Level>(initial.level);
  const [teamId, setTeamId] = useState(initial.teamId);
  const [parentId, setParentId] = useState(initial.parentId);
  const [owner, setOwner] = useState(initial.owner);
  const [title, setTitle] = useState(initial.title);
  const [why, setWhy] = useState(initial.why);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [viewers, setViewers] = useState<string[]>(initial.viewers);
  const [krs, setKrs] = useState<KrDraft[]>(mode === "new" ? [emptyDraft(initial.owner)] : []);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const allowedParents = parents.filter(p => (level === "team" ? p.level === "company" : level === "personal" ? p.level !== "personal" : false));
  const writableTeams = teams.filter(x => x.writable);
  // "Its team only" needs a team that is a group of the Chest (a team named
  // here has no list of members).
  const teamIsGroup = level === "team" && teams.some(x => x.id === teamId && x.group);
  const seen: Visibility = visibility === "team" && !teamIsGroup ? "everyone" : visibility;
  const shared = { visibility: seen, viewers: seen === "people" ? viewers : [] };

  function submit() {
    if (!title.trim()) {
      setError(t.errors.empty);
      document.getElementById(`${uid}-title`)?.focus();
      return;
    }
    if ((level !== "personal" && !owner) || (mode === "new" && krs.some(k => k.title.trim() !== "" && !k.owner))) {
      setError(f.ownerMissing);
      return;
    }
    if (pending) return;
    setError(null);
    setPending(true);
    void (async () => {
      // Sent as typed; the server reads each part and refuses with a code.
      // Then the objective's page.
      if (mode === "new") {
        const keyResults = krs.filter(k => k.title.trim() !== "").map(krInput);
        const r = await call("createObjective", { cycleId, level, ...(level === "team" && teamId ? { teamId } : {}), ...(parentId ? { parentId } : {}), owner: level === "personal" ? me : owner, title, why, keyResults, ...shared }, { quiet: true, refresh: false });
        setPending(false);
        if (!r.ok) return setError(r.message);
        await navigate(`/chest/objectives/${r.value.id}`);
      } else if (objectiveId) {
        const r = await call("updateObjective", { id: objectiveId, title, why, owner, parentId: parentId || null, ...(level === "team" && teamId ? { teamId } : {}), ...shared }, { quiet: true, refresh: false });
        setPending(false);
        if (!r.ok) return setError(r.message);
        await navigate(`/chest/objectives/${objectiveId}`);
      }
    })();
  }

  return (
    <form className="card form-card" onSubmit={e => { e.preventDefault(); submit(); }} noValidate>
      {mode === "new" && levels.length > 1 && (
        <fieldset className="choices">
          <legend>{f.level}</legend>
          {levels.map(l => (
            <label key={l} className="choice">
              <input type="radio" name={`${uid}-level`} value={l} checked={level === l} onChange={() => { setLevel(l); setParentId(""); }} />
              <span>{t.levels[l]}</span>
              <small>{f.levelHint[l]}</small>
            </label>
          ))}
        </fieldset>
      )}
      <div>
        <label className="label" htmlFor={`${uid}-title`}>{f.title}</label>
        <input id={`${uid}-title`} className="field" maxLength={200} value={title} placeholder={f.titlePlaceholder} onChange={e => setTitle(e.target.value)} aria-describedby={`${uid}-title-hint`} autoFocus={mode === "new"} />
        <p id={`${uid}-title-hint`} className="hint">{f.titleHint}</p>
      </div>
      {level === "team" && (
        writableTeams.length === 0 ? <p className="notice"><Alert />{f.noTeams}</p> : (
          <div>
            <label className="label" htmlFor={`${uid}-team`}>{f.team}</label>
            <select id={`${uid}-team`} className="select" value={teamId} onChange={e => setTeamId(e.target.value)} required>
              <option value="" disabled>{f.chooseTeam}</option>
              {writableTeams.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        )
      )}
      <div>
        <label className="label" htmlFor={`${uid}-why`}>{f.why}</label>
        <textarea id={`${uid}-why`} className="field" rows={3} maxLength={2000} value={why} placeholder={f.whyPlaceholder} onChange={e => setWhy(e.target.value)} />
      </div>
      <div className="grid-2">
        {level !== "personal" && owners.length > 0 && (
          <PeoplePicker label={f.owner} value={owners.filter(o => o.id === owner)} search={localSearch(owners)} labels={t.peoplePicker} lang={locale}
            onChange={v => { const next = v[0]?.id ?? ""; setOwner(next); if (next) setKrs(list => list.map(k => (k.owner === owner ? { ...k, owner: next } : k))); }} />
        )}
        {level !== "company" && (
          <div>
            <label className="label" htmlFor={`${uid}-parent`}>{f.parent}</label>
            <select id={`${uid}-parent`} className="select" value={parentId} onChange={e => setParentId(e.target.value)} aria-describedby={`${uid}-parent-hint`}>
              <option value="">{f.noParent}</option>
              {allowedParents.map(p => <option key={p.id} value={p.id}>{p.team ? `${p.team} · ` : ""}{p.title}</option>)}
            </select>
            <p id={`${uid}-parent-hint`} className="hint">{f.parentHint}</p>
          </div>
        )}
      </div>
      {level === "personal" && personalNote && <p className="notice"><Alert />{f.personalNote}</p>}
      <details className="more" open={initial.visibility !== "everyone" || undefined}>
        <summary>{t.visibility.legend}: {seen === "everyone" ? t.visibility.everyone : seen === "team" ? t.visibility.team : t.visibility.people}</summary>
        <fieldset className="choices compact">
          <legend className="visually-hidden">{t.visibility.legend}</legend>
          {(["everyone", "team", "people"] as const).filter(v => v !== "team" || teamIsGroup).map(v => (
            <label key={v} className="choice">
              <input type="radio" name={`${uid}-visibility`} value={v} checked={seen === v} onChange={() => setVisibility(v)} />
              <span>{t.visibility[v]}</span>
            </label>
          ))}
        </fieldset>
        {seen === "people" && (
          <div className="viewers">
            <PeoplePicker label={t.visibility.add} multiple value={viewers.map(id => owners.find(o => o.id === id) ?? { id, name: "—", photo: null })} onChange={v => setViewers(v.map(x => x.id))}
              search={localSearch(owners.filter(o => o.id !== owner))} {...(viewers.length === 0 ? { hint: t.visibility.nobody } : {})} labels={t.peoplePicker} lang={locale} />
          </div>
        )}
        <p className="hint">{t.visibility.hint}</p>
      </details>

      {mode === "new" && (
        <fieldset className="stack plain">
          <legend className="stack-s">
            <span className="h3">{f.keyResults}</span>
            <span className="hint">{f.keyResultsHint}</span>
          </legend>
          <ol className="kr-rows">
            {krs.map((k, i) => (
              <li key={i} className="kr-row">
                <div className="row-head">
                  <span className="eyebrow">{f.krTitle} {i + 1}</span>
                  {krs.length > 1 && <button type="button" className="icon-button" onClick={() => setKrs(list => list.filter((_, j) => j !== i))}><Trash /><span className="visually-hidden">{f.removeRow}</span></button>}
                </div>
                <KeyResultFields draft={k} onChange={d => setKrs(list => list.map((x, j) => (j === i ? d : x)))} owners={owners} t={t} locale={locale} currency={currency} boards={boards} />
              </li>
            ))}
          </ol>
          {krs.length < 10 && <div><button type="button" className="button quiet" onClick={() => setKrs(list => [...list, emptyDraft(level === "personal" ? me : owner)])}><Plus />{f.addAnother}</button></div>}
        </fieldset>
      )}

      {error && <p className="error" role="alert"><Alert />{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending || (level === "team" && !teamId)} aria-busy={pending}>{pending ? (mode === "new" ? f.creating : f.saving) : mode === "new" ? f.create : f.save}</button>
        <button type="button" className="button quiet" onClick={() => history.back()}>{f.cancel}</button>
      </div>
    </form>
  );
}
