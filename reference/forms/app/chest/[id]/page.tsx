import { canEdit } from "../../../lib/forms.ts";
import { currentMember, publicAddress, words } from "../../../lib/session.ts";
import { closeForm, publishForm, removeForm } from "../../actions.ts";
import { number, when } from "../labels.ts";
import { loadForm } from "../load.ts";

export default async function FormPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const refused = (await searchParams)["refused"];
  const form = await loadForm(id);
  const editor = canEdit(await currentMember());
  const address = await publicAddress(form.slug);
  const t = await words();
  return (
    <main>
      <p className="small"><a href="/chest">{t.appName}</a></p>
      <div className="lead">
        <div>
          <h1>{form.title}</h1>
          {form.description && <p>{form.description}</p>}
        </div>
      </div>
      {typeof refused === "string" && t.form.refusals[refused] && <p className="notice" role="alert">{t.form.refusals[refused]}</p>}
      <dl className="facts">
        <dt>{t.form.status}</dt>
        <dd>{t.statuses[form.status]}{form.status === "draft" ? t.form.draftNote : form.status === "closed" ? t.form.closedNote : ""}</dd>
        <dt>{t.form.address}</dt>
        <dd>{form.status === "draft" ? <>{address} <span className="small">{t.form.addressDraft}</span></> : <a href={address} target="_blank" rel="noopener noreferrer">{address}</a>}</dd>
        <dt>{t.form.responses}</dt>
        <dd><a href={"/chest/" + form.id + "/responses"}>{t.count(form.responses)}</a></dd>
        <dt>{t.form.updated}</dt>
        <dd>{when(form.updated, t.dateLocale)}</dd>
      </dl>
      <h2 className="section">{t.form.fields}</h2>
      <ol className="list">
        {form.fields.map((field, i) => (
          <li key={field.id}>
            <span className="num">{number(i)}</span>
            <span>{field.label}</span>
            <span className="status">{t.kinds[field.kind]}</span>
            <span className="status">{field.required ? t.form.required : t.form.optional}</span>
          </li>
        ))}
      </ol>
      {editor && (
        <div className="actions">
          {form.status === "draft" && <a className="button quiet" href={"/chest/" + form.id + "/edit"}>{t.form.edit}</a>}
          {form.status === "draft" && <form action={publishForm.bind(null, form.id)}><button className="button" type="submit">{t.form.publish}</button></form>}
          {form.status === "published" && <form action={closeForm.bind(null, form.id)}><button className="button" type="submit">{t.form.close}</button></form>}
          {form.status === "draft" && <form action={removeForm.bind(null, form.id)}><button className="button quiet" type="submit">{t.form.remove}</button></form>}
        </div>
      )}
    </main>
  );
}
