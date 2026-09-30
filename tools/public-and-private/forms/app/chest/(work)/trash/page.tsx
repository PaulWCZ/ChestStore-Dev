import { chest } from "@argentic/chest-sdk/chest";
import { Back } from "../../../../components/icons.tsx";
import { db } from "../../../../lib/db.ts";
import { trash, trashDays } from "../../../../lib/forms.ts";
import { format, formatDate, plural } from "../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { RestoreButton } from "./restore-button.tsx";

// Deleted forms: kept 30 days with their answers and files, then gone for
// good (cleanup). Their owner — or a manager — brings one back.
export default async function TrashPage() {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const forms = await trash(db(), member);
  const owners = await people(forms.map(f => f.owner));
  const zone = chest.timeZone;
  return (
    <div className="panel-page">
      <a className="back-link" href="/chest"><Back />{t.shell.home}</a>
      <h1 className="page-title">{t.trash.title}</h1>
      <p className="lede">{format(t.trash.lede, { days: trashDays })}</p>
      {forms.length === 0 ? <p className="quiet-note">{t.trash.empty}</p> : (
        <ul className="trash-list">
          {forms.map(f => (
            <li key={f.id} className="panel">
              <span className="trash-title">{f.title || t.builder.untitled}</span>
              <span className="dim">{plural(t.home.answers, f.answers, locale)} · {format(t.trash.deletedOn, { date: formatDate(f.deletedAt, locale, zone, { day: "numeric", month: "long" }) })}{f.owner !== member.id ? ` · ${nameOf(owners.get(f.owner), locale)}` : ""}</span>
              <RestoreButton formId={f.id} label={t.trash.restore} done={t.trash.restored} errors={t.errors} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
