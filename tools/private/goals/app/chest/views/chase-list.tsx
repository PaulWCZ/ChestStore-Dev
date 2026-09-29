"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, Check } from "../../../components/icons.tsx";
import { PersonLine } from "../../../components/person.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { remind, remindAll } from "../actions.ts";

export type ChasePerson = { person: { id: string; name: string; photo: string | null; gone: boolean }; items: { id: string; title: string; objectiveId: string; last: string }[]; reminded: boolean };

// Who has not checked in this week, person by person, with what waits and
// when they last did; "Remind" sends one bell item and one email (once a
// day, whoever asks). The admins may remind everyone at once.
export function ChaseList({ people, all, locale, t }: { people: ChasePerson[]; all: boolean; locale: string; t: { chase: Catalogue["chase"]; errors: Catalogue["errors"]; objective: Catalogue["objective"] } }) {
  const [done, setDone] = useState<string[]>(people.filter(p => p.reminded).map(p => p.person.id));
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const left = people.filter(p => !done.includes(p.person.id));
  const c = t.chase;
  return (
    <details className="card chase">
      <summary>
        <span className="h3">{c.title}</span>
        <span className="count">{plural(c.people, people.length, locale)}</span>
      </summary>
      <p className="hint">{c.intro}</p>
      <ul className="chase-rows">
        {people.map(p => {
          const reminded = done.includes(p.person.id);
          return (
            <li key={p.person.id}>
              <div className="grow">
                <PersonLine person={p.person} size={24} />
                <ul className="chase-items">
                  {p.items.map(i => <li key={i.id}><a href={`/chest/objectives/${i.objectiveId}#kr-${i.id}`}>{i.title}</a> <span className="muted">· {i.last}</span></li>)}
                </ul>
              </div>
              {reminded ? (
                <span className="tag done-tag"><Check />{c.reminded}</span>
              ) : (
                <button type="button" className="button quiet small" disabled={pending} aria-label={format(c.remindName, { name: p.person.name })} onClick={() => start(async () => {
                  const r = await remind(p.person.id);
                  if (!r.ok && r.error !== "already_reminded") return toast(format(t.errors[r.error], r.values ?? {}));
                  setDone(d => [...d, p.person.id]);
                  toast(r.ok ? format(c.remindedToast, { name: p.person.name }) : t.errors.already_reminded);
                })}><Bell />{c.remind}</button>
              )}
            </li>
          );
        })}
      </ul>
      {all && left.length > 1 && (
        <div className="form-actions">
          <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => {
            const r = await remindAll();
            if (!r.ok) return toast(format(t.errors[r.error], r.values ?? {}));
            setDone(people.map(p => p.person.id));
            toast(plural(c.remindedAll, r.value, locale));
            router.refresh();
          })}><Bell />{plural(c.remindAll, left.length, locale)}</button>
        </div>
      )}
    </details>
  );
}
