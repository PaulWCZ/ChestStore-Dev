"use client";

import { useId, useState } from "react";
import { Avatar } from "./avatar.tsx";

type Person = { id: string; name: string; photo: string | null };

// Choose people (and groups) by ticking them, with a search when the list
// is long. Used where a board is shared: the "New board" dialog, and the
// board's settings.
export function PeoplePicker({ people, groups, chosen, chosenGroups, onChange, t }: {
  people: Person[];
  groups: { id: string; name: string }[];
  chosen: string[];
  chosenGroups: string[];
  onChange: (people: string[], groups: string[]) => void;
  t: { find: string; groups: string; people: string };
}) {
  const [q, setQ] = useState("");
  const id = useId();
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  const shown = people.filter(p => fold(p.name).includes(fold(q)));
  return (
    <div className="people-picker">
      {people.length > 8 && (
        <>
          <label className="visually-hidden" htmlFor={`${id}-find`}>{t.find}</label>
          <input id={`${id}-find`} className="field" type="search" placeholder={t.find} value={q} onChange={e => setQ(e.target.value)} />
        </>
      )}
      <fieldset className="picker-list" aria-label={t.people}>
        {shown.map(p => (
          <label key={p.id}>
            <input type="checkbox" checked={chosen.includes(p.id)} onChange={e => onChange(e.target.checked ? [...chosen, p.id] : chosen.filter(x => x !== p.id), chosenGroups)} />
            <Avatar name={p.name} photo={p.photo} size={24} />{p.name}
          </label>
        ))}
      </fieldset>
      {groups.length > 0 && (
        <fieldset className="picker-groups">
          <legend className="label">{t.groups}</legend>
          <div className="row">
            {groups.map(g => (
              <label key={g.id} className="choice small-choice">
                <input type="checkbox" checked={chosenGroups.includes(g.id)} onChange={e => onChange(chosen, e.target.checked ? [...chosenGroups, g.id] : chosenGroups.filter(x => x !== g.id))} />
                {g.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
