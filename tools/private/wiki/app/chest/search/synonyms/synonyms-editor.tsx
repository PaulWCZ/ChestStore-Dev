"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useState, useTransition } from "react";
import { Plus, Trash } from "../../../../components/icons.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { deleteSynonyms, saveSynonyms } from "../../actions.ts";

type Group = { id: string; words: string[] };
type Words = { synonyms: Catalogue["synonyms"]; errors: Catalogue["errors"] };

// Each line a field ("vacances, congés, holidays"), saved when it is left
// or with Enter; a line deleted comes back with Undo; one more at the end.
export function SynonymsEditor({ initial, t }: { initial: Group[]; t: Words }) {
  const toast = useToast();
  const [groups, setGroups] = useState(initial);
  const [fresh, setFresh] = useState("");
  const [, start] = useTransition();
  const w = t.synonyms;
  const fail = (r: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => void toast({ text: format(t.errors[r.error], r.values), tone: "error" });
  function save(group: Group, text: string) {
    if (text === group.words.join(", ")) return;
    start(async () => {
      const r = await saveSynonyms(group.id, text);
      if (!r.ok) return fail(r);
      setGroups(list => list.map(g => (g.id === group.id ? r.value : g)));
      toast({ id: `synonyms-${group.id}`, text: w.saved });
    });
  }
  function add() {
    start(async () => {
      const r = await saveSynonyms(null, fresh);
      if (!r.ok) return fail(r);
      setGroups(list => [...list, r.value]);
      setFresh("");
      toast({ id: "synonyms-new", text: w.saved });
    });
  }
  function remove(group: Group) {
    start(async () => {
      const r = await deleteSynonyms(group.id);
      if (!r.ok) return fail(r);
      setGroups(list => list.filter(g => g.id !== group.id));
      toast({
        id: `synonyms-${group.id}`,
        text: w.removed,
        undo: async () => {
          const back = await saveSynonyms(null, r.value.join(", "));
          if (!back.ok) return format(t.errors[back.error], back.values);
          setGroups(list => [...list, back.value]);
          return true;
        },
      });
    });
  }
  return (
    <div className="stack">
      {groups.length === 0 && <p className="muted">{w.empty}</p>}
      <ol className="synonym-lines">
        {groups.map((g, i) => (
          <li key={g.id} className="synonym-line">
            <label className="visually-hidden" htmlFor={`syn-${g.id}`}>{format(w.label, { n: i + 1 })}</label>
            <input id={`syn-${g.id}`} className="field" defaultValue={g.words.join(", ")} maxLength={600}
              onBlur={e => save(g, e.currentTarget.value.trim())}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
            <button type="button" className="button quiet small" onClick={() => remove(g)}><Trash />{w.remove}</button>
          </li>
        ))}
      </ol>
      <form className="synonym-line new" onSubmit={e => { e.preventDefault(); if (fresh.trim()) add(); }}>
        <label className="label" htmlFor="syn-new">{w.newLabel}</label>
        <div className="row-actions">
          <input id="syn-new" className="field" value={fresh} maxLength={600} placeholder={w.placeholder} onChange={e => setFresh(e.target.value)} />
          <button type="submit" className="button" disabled={!fresh.trim()}><Plus />{w.add}</button>
        </div>
      </form>
    </div>
  );
}
