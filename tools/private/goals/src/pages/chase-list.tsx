import { Island } from "@argentic/chest-app";
import type { Catalogue } from "../i18n/index.ts";
import { plural } from "../shared/format.ts";
import { PersonLine } from "../components/person.tsx";

export type ChasePerson = { person: { id: string; name: string; photo: string | null; gone: boolean }; items: { id: string; title: string; objectiveId: string; last: string }[]; reminded: boolean };

// Who has not updated this week, person by person, with what waits and
// when they last did — drawn on the server (a company's whole list); each
// "Remind" is a small island of its own. The admins may remind everyone.
export function ChaseList({ people, all, locale, t }: { people: ChasePerson[]; all: boolean; locale: string; t: Catalogue["chase"] }) {
  const left = people.filter(p => !p.reminded).length;
  const words = { remind: t.remind, remindName: t.remindName, reminded: t.reminded, remindedToast: t.remindedToast };
  return (
    <details className="card chase">
      <summary>
        <span className="h3">{t.title}</span>
        <span className="count">{plural(t.people, people.length, locale)}</span>
      </summary>
      <p className="hint">{t.intro}</p>
      <ul className="chase-rows">
        {people.map(p => (
          <li key={p.person.id} id={`chase-${p.person.id}`}>
            <div className="grow">
              <PersonLine person={p.person} />
              <ul className="chase-items">
                {p.items.map(i => <li key={i.id}><a href={`/chest/objectives/${i.objectiveId}#kr-${i.id}`}>{i.title}</a> <span className="muted">· {i.last}</span></li>)}
              </ul>
            </div>
            <Island id={`remind-${p.person.id}`} name="Remind" props={{ owner: p.person.id, name: p.person.name, reminded: p.reminded, t: words }} />
          </li>
        ))}
      </ul>
      {all && left > 1 && <div className="form-actions"><Island id="remind-all" name="RemindAll" props={{ count: left, locale, t: { remindAll: t.remindAll, remindedAll: t.remindedAll } }} /></div>}
    </details>
  );
}
