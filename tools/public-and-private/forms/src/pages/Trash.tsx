import { Back, Restore } from "../components/icons.tsx";
import { format, plural, when } from "../i18n/index.ts";
import { trash, trashDays } from "../lib/forms.ts";
import { nameOf, people } from "../lib/people.ts";
import type { Ctx } from "./context.ts";

// Deleted forms: kept 30 days with their answers and files, then gone for
// good (cleanup). Their owner — or a manager — brings one back: a plain
// form to the action restoreForm, which opens the form.
export async function trashPage({ sql, member, t, lang, zone }: Ctx) {
  const forms = await trash(sql, member);
  const owners = await people(forms.map(f => f.owner));
  return {
    title: t.trash.title,
    body: (
      <div className="panel-page">
        <a className="back-link" href="/chest"><Back />{t.shell.home}</a>
        <h1 className="page-title">{t.trash.title}</h1>
        <p className="lede">{format(t.trash.lede, { days: trashDays })}</p>
        {forms.length === 0 ? <p className="quiet-note">{t.trash.empty}</p> : (
          <ul className="trash-list">
            {forms.map(f => (
              <li key={f.id} id={`deleted-${f.id}`} className="panel">
                <span className="trash-title">{f.title || t.builder.untitled}</span>
                <span className="dim">{plural(t.home.answers, f.answers, lang)} · {format(t.trash.deletedOn, { date: when(f.deletedAt, lang, zone, { time: false, long: true }) })}{f.owner !== member.id ? ` · ${nameOf(owners.get(f.owner), lang)}` : ""}</span>
                <form method="post" action="/chest/actions/restoreForm">
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="open" value="1" />
                  <button type="submit" className="button quiet small"><Restore />{t.trash.restore}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    ),
  };
}
