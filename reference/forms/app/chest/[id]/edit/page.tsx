import { canEdit } from "../../../../lib/forms.ts";
import { currentMember, words } from "../../../../lib/session.ts";
import { updateForm } from "../../../actions.ts";
import { Editor } from "../../editor.tsx";
import { loadForm } from "../../load.ts";

export default async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await loadForm(id);
  const t = await words();
  const back = <p className="small"><a href={"/chest/" + form.id}>{form.title}</a></p>;
  if (!canEdit(await currentMember()) || form.status !== "draft") {
    return <main>{back}<h1>{t.edit.title}</h1><p>{t.edit.refused}</p></main>;
  }
  return (
    <main>
      {back}
      <div className="lead"><div><h1>{t.edit.heading}</h1></div></div>
      <Editor initial={{ title: form.title, description: form.description, fields: form.fields.map(({ label, kind, required }) => ({ label, kind, required })) }} action={updateForm.bind(null, form.id)} submit={t.edit.submit} words={t.editor} kinds={t.kinds} />
    </main>
  );
}
