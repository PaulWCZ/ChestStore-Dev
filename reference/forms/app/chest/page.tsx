import { canEdit } from "../../lib/forms.ts";
import { currentMember, forms, words } from "../../lib/session.ts";
import { number } from "./labels.ts";

export default async function FormsList() {
  const actor = await currentMember();
  const list = await forms.list(actor);
  const t = await words();
  return (
    <main>
      <div className="lead">
        <div>
          <h1>{t.appName}</h1>
          <p>{t.list.intro}</p>
        </div>
        {canEdit(actor) && <a className="button" href="/chest/new">{t.list.create}</a>}
      </div>
      {list.length === 0 ? (
        <p>{t.list.empty}</p>
      ) : (
        <ol className="list">
          {list.map((form, i) => (
            <li key={form.id}>
              <span className="num">{number(i)}</span>
              <a href={"/chest/" + form.id}>{form.title}</a>
              <span className="status">{t.statuses[form.status]}</span>
              <span className="status">{t.count(form.responses)}</span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
