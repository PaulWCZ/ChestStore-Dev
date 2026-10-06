import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";
import { Bell, Check } from "../components/icons.tsx";
import { PersonLine } from "../components/person.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "../shared/format.ts";

export type ChasePerson = { person: { id: string; name: string; photo: string | null; gone: boolean }; items: { id: string; title: string; objectiveId: string; last: string }[]; reminded: boolean };

// Who has not checked in this week, person by person, with what waits and
// when they last did; "Remind" sends one bell item and one email (once a
// day, whoever asks). The admins may remind everyone at once.
export function ChaseList({ people, all, locale, t }: { people: ChasePerson[]; all: boolean; locale: string; t: { chase: Catalogue["chase"]; errors: Catalogue["errors"]; objective: Catalogue["objective"] } }) {
  const [done, setDone] = useState<string[]>(people.filter(p => p.reminded).map(p => p.person.id));
  const [pending, setPending] = useState(false);
  // One reminder at a time from this list.
  async function act(step: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    try { await step(); } finally { setPending(false); }
  }
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
            <li key={p.person.id} id={`chase-${p.person.id}`}>
              <div className="grow">
                <PersonLine person={p.person} />
                <ul className="chase-items">
                  {p.items.map(i => <li key={i.id}><a href={`/chest/objectives/${i.objectiveId}#kr-${i.id}`}>{i.title}</a> <span className="muted">· {i.last}</span></li>)}
                </ul>
              </div>
              {reminded ? (
                <span className="tag done-tag"><Check />{c.reminded}</span>
              ) : (
                <button type="button" className="button quiet small" disabled={pending} aria-busy={pending} aria-label={format(c.remindName, { name: p.person.name })} onClick={() => void act(async () => {
                  const r = await call("remind", { owner: p.person.id }, { quiet: true, refresh: false });
                  if (!r.ok && r.error !== "already_reminded") return void toast({ text: r.message, tone: "error" });
                  setDone(d => [...d, p.person.id]);
                  // The bell item and the email left: never an Undo. "By email"
                  // only when one left.
                  toast({ id: `remind-${p.person.id}`, text: r.ok ? format(r.value.emailed ? c.remindedToast : c.remindedBell, { name: p.person.name }) : r.message, sent: true });
                })}><Bell />{c.remind}</button>
              )}
            </li>
          );
        })}
      </ul>
      {all && left.length > 1 && (
        <div className="form-actions">
          <button type="button" className="button quiet" disabled={pending} aria-busy={pending} onClick={() => void act(async () => {
            const r = await call("remindAll", {}, { quiet: true });
            if (!r.ok) return void toast({ text: r.message, tone: "error" });
            setDone(people.map(p => p.person.id));
            toast({ id: "remind-all", text: plural(c.remindedAll, r.value, locale), sent: true });
          })}><Bell />{plural(c.remindAll, left.length, locale)}</button>
        </div>
      )}
    </details>
  );
}
