import { canEdit } from "../../../lib/forms.ts";
import { currentMember, words } from "../../../lib/session.ts";
import { createForm } from "../../actions.ts";
import { Editor } from "../editor.tsx";

export default async function NewForm() {
  const t = await words();
  if (!canEdit(await currentMember())) {
    return <main><h1>{t.create.title}</h1><p>{t.create.refused}</p></main>;
  }
  return (
    <main>
      <div className="lead"><div><h1>{t.create.title}</h1><p>{t.create.intro}</p></div></div>
      <Editor initial={{ title: "", description: "", fields: [{ label: "", kind: "text", required: true }] }} action={createForm} submit={t.create.submit} words={t.editor} kinds={t.kinds} />
    </main>
  );
}
