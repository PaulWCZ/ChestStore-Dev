"use client";

import { PeoplePicker, useToast } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Check, Pencil, Plus } from "../../../components/icons.tsx";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { addAllGroups, addGroupTeam, addTeam, archiveTeam, reassign, renameTeam, saveSettings } from "../actions.ts";

type TeamRow = { id: string; name: string; group: boolean; archived: boolean; members: number | null };
type Orphans = { owner: string; name: string; items: { kind: "objective" | "key_result"; id: string; title: string; objectiveTitle: string; objectiveId: string; cycle: string }[] }[];
type Words = { settings: Catalogue["settings"]; errors: Catalogue["errors"]; teams: Catalogue["teams"]; peoplePicker: PeoplePickerWords };
type Person = { id: string; name: string; photo: string | null };

export function SettingsView({ personal, teams, groups, orphans, owners, locale, t }: { personal: boolean; teams: TeamRow[]; groups: { id: string; name: string }[]; orphans: Orphans; owners: Person[]; locale: string; t: Words }) {
  const s = t.settings;
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(personal);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const words = (code: keyof Words["errors"], values: Record<string, string | number> = {}) => format(t.errors[code], values);

  function act<T>(step: () => Promise<{ ok: true; value: T } | { ok: false; error: keyof Words["errors"]; values?: Record<string, string | number> }>, done: (value: T) => string | null, undo?: () => Promise<{ ok: true } | { ok: false; error: keyof Words["errors"]; values?: Record<string, string | number> }>) {
    start(async () => {
      const r = await step();
      if (!r.ok) {
        setError(words(r.error, r.values));
        return;
      }
      setError(null);
      const text = done(r.value);
      if (text) toast({ id: "settings", text, ...(undo ? { undo: async () => { const back = await undo(); router.refresh(); return back.ok ? true : words(back.error, back.values); } } : {}) });
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <section className="card card-pad stack" aria-labelledby="personal">
        <h2 id="personal">{s.personal}</h2>
        <p>{s.personalBody}</p>
        <label className="check">
          <input type="checkbox" checked={on} disabled={pending} onChange={e => { const next = e.target.checked; setOn(next); act(() => saveSettings({ personal: next }), () => (next ? s.savedOn : s.savedOff)); }} />
          {s.personalOn}
        </label>
        <p className="notice"><Alert />{s.personalLegal}</p>
      </section>

      <section className="card card-pad stack" aria-labelledby="teams-title" id="teams">
        <h2 id="teams-title">{s.teams}</h2>
        <p className="muted">{s.teamsBody}</p>
        {groups.length > 0 && (
          <div className="row">
            <button type="button" className="button" disabled={pending} onClick={() => act(() => addAllGroups(), n => plural(s.addedGroups, n, locale))}><Plus />{plural(s.addGroups, groups.length, locale)}</button>
            {groups.length > 1 && (
              <form className="row" onSubmit={e => { e.preventDefault(); if (group) act(() => addGroupTeam(group), () => s.added); }}>
                <label className="visually-hidden" htmlFor="group">{s.fromGroup}</label>
                <select id="group" className="select auto" value={group} onChange={e => setGroup(e.target.value)}>
                  <option value="">{s.chooseGroup}</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button type="submit" className="button quiet" disabled={pending || !group}>{s.addGroup}</button>
              </form>
            )}
          </div>
        )}
        <form className="row" onSubmit={e => { e.preventDefault(); act(() => addTeam(name), () => { setName(""); return s.added; }); }}>
          <label className="label full" htmlFor="team-name">{s.byName}</label>
          <input id="team-name" className="field grow-field" maxLength={60} value={name} placeholder={s.teamNamePlaceholder} onChange={e => setName(e.target.value)} />
          <button type="submit" className="button quiet" disabled={pending || !name.trim()}><Plus />{s.add}</button>
        </form>
        {error && <p className="error" role="alert"><Alert />{error}</p>}
        {teams.length === 0 ? <p className="muted">{s.noTeams}</p> : (
          <ul className="rows bordered">
            {teams.map(x => (
              <li key={x.id}>
                {renaming?.id === x.id ? (
                  <form className="row grow" onSubmit={e => { e.preventDefault(); act(() => renameTeam(x.id, renaming.name), () => { setRenaming(null); return s.renamed; }); }}>
                    <label className="visually-hidden" htmlFor={`rename-${x.id}`}>{s.teamName}</label>
                    <input id={`rename-${x.id}`} className="field grow-field" maxLength={60} value={renaming.name} onChange={e => setRenaming({ id: x.id, name: e.target.value })} autoFocus />
                    <button type="submit" className="button small" disabled={pending}><Check />{s.save}</button>
                    <button type="button" className="button quiet small" onClick={() => setRenaming(null)}>{s.cancel}</button>
                  </form>
                ) : (
                  <>
                    <div className="grow">
                      <Link href={`/chest/teams/${x.id}`}>{x.name}</Link>
                      <span className="meta">
                        <span className="tag">{x.group ? s.group : s.named}</span>
                        {x.members !== null && <span>{plural(t.teams.members, x.members, locale)}</span>}
                        {x.archived && <span className="tag stale">{s.archivedTag}</span>}
                      </span>
                    </div>
                    {!x.group && !x.archived && <button type="button" className="button quiet small" onClick={() => setRenaming({ id: x.id, name: x.name })}><Pencil />{s.rename}</button>}
                    {x.archived
                      ? <button type="button" className="button quiet small" disabled={pending} onClick={() => act(() => archiveTeam(x.id, false), () => s.restored)}>{s.restore}</button>
                      : <button type="button" className="button quiet small" disabled={pending} onClick={() => act(() => archiveTeam(x.id, true), () => s.archived, () => archiveTeam(x.id, false))}>{s.archive}</button>}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card card-pad stack" aria-labelledby="owners-title" id="owners">
        <h2 id="owners-title">{s.owners}</h2>
        {orphans.length === 0 ? <p className="muted"><Check /> {s.ownersEmpty}</p> : (
          <>
            <p className="muted">{s.ownersBody}</p>
            {orphans.map(g => <OrphanGroup key={g.owner} group={g} owners={owners} pending={pending} locale={locale} onGive={(input, n) => act(() => reassign(input), () => plural(s.given, n, locale))} t={t} />)}
          </>
        )}
      </section>
    </div>
  );
}

function OrphanGroup({ group, owners, pending, locale, onGive, t }: { group: Orphans[number]; owners: Person[]; pending: boolean; locale: string; onGive: (input: { kind: "objective" | "key_result" | "all"; id?: string; from?: string; to: string }, n: number) => void; t: Words }) {
  const s = t.settings;
  const [all, setAll] = useState("");
  const [each, setEach] = useState<Record<string, string>>({});
  return (
    <div className="orphans">
      <form className="row" onSubmit={e => { e.preventDefault(); if (all) onGive({ kind: "all", from: group.owner, to: all }, group.items.length); }}>
        <div className="grow-field">
          <PeoplePicker label={format(s.giveAll, { name: group.name })} value={owners.filter(o => o.id === all)} onChange={v => setAll(v[0]?.id ?? "")} search={localSearch(owners)} labels={t.peoplePicker} lang={locale} />
        </div>
        <button type="submit" className="button" disabled={pending || !all}>{s.give}</button>
      </form>
      <ul className="rows bordered">
        {group.items.map(i => {
          const key = `${i.kind}-${i.id}`;
          return (
            <li key={key}>
              <div className="grow">
                <span className="eyebrow">{i.kind === "objective" ? s.objectiveTag : s.keyResultTag} · {i.cycle}</span>
                <Link href={`/chest/objectives/${i.objectiveId}`}>{i.title}</Link>
                {i.kind === "key_result" && <span className="hint">{format(s.in, { objective: i.objectiveTitle })}</span>}
              </div>
              <form className="row give" onSubmit={e => { e.preventDefault(); const to = each[key]; if (to) onGive({ kind: i.kind, id: i.id, to }, 1); }}>
                <div className="grow-field">
                  <PeoplePicker label={format(s.giveOne, { title: i.title })} hideLabel value={owners.filter(o => o.id === each[key])} onChange={v => setEach({ ...each, [key]: v[0]?.id ?? "" })} search={localSearch(owners)} labels={t.peoplePicker} lang={locale} />
                </div>
                <button type="submit" className="button quiet" disabled={pending || !each[key]}>{s.give}</button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
