import { PeoplePicker } from "@argentic/chest-ui/components";
import { localSearch, type Choice } from "@argentic/chest-ui/components/logic";
import { useMemo } from "react";
import type { Teammate, Words } from "./shared.ts";

export type OwnerWords = Words<"people" | "peoplePicker" | "common" | "meta">;

type Person = Choice & { kind: "member" };

// Who owns it: someone of the team (a manager or a salesperson), or nobody
// (the field left empty) — the kit's people picker: type "lé" or "mor",
// arrows, Enter; the team is offered before anything is typed. Someone who
// may not give things away is offered only themselves.
export function OwnerPicker({ id, label, hideLabel = false, hint = true, value, team, me, canAssign, allowNobody = true, onChange, t }: { id: string; label: string; hideLabel?: boolean; hint?: boolean; value: string | null; team: Teammate[]; me: string; canAssign: boolean; allowNobody?: boolean; onChange: (value: string | null) => void; t: OwnerWords }) {
  const people = useMemo<Person[]>(() => (canAssign ? team : team.filter(p => p.id === me || p.id === value)).map(p => ({ kind: "member", id: p.id, name: p.name, photo: p.photo, ...(p.id === me ? { detail: t.people.you } : {}) })), [canAssign, team, me, value, t.people.you]);
  const chosen: Person[] = value === null ? [] : [people.find(p => p.id === value) ?? { kind: "member", id: value, name: t.people.unknown }];
  const search = useMemo(() => localSearch(people), [people]);
  const nobody = allowNobody && canAssign;
  return (
    <PeoplePicker<Person>
      id={id}
      label={label}
      hideLabel={hideLabel}
      value={chosen}
      // Emptied: nobody, when that is allowed; otherwise the owner stays
      // (the field shows them again when left).
      onChange={next => { if (next[0] || nobody) onChange(next[0]?.id ?? null); }}
      search={search}
      suggestions={people.slice(0, 12)}
      suggestionsLabel={t.peoplePicker.suggested}
      required={!nobody}
      // Nobody is allowed: a button takes the owner away (the kit's clearable).
      clearable={nobody}
      {...(nobody && hint ? { hint: t.common.nobodyHint } : {})}
      labels={t.peoplePicker}
      lang={t.meta.lang}
    />
  );
}
