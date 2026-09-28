import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { forms, words } from "../../../lib/session.ts";
import { answerForm } from "../../actions.ts";
import { AnswerForm } from "./answer.tsx";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const form = await forms.publicForm((await params).slug);
  return { title: form ? form.title : (await words()).appName };
}

// A form as anybody on the Internet sees it: published, to answer without
// signing in; closed, to say so — its answers stay with the team; a draft
// or an unknown address is nothing at all.
export default async function PublicForm({ params }: Props) {
  const form = await forms.publicForm((await params).slug);
  if (!form) notFound();
  const t = await words();
  return (
    <main className="page public">
      <h1>{form.title}</h1>
      {form.description && <p className="description">{form.description}</p>}
      {form.status === "closed" ? (
        <p className="notice">{t.answer.closed}</p>
      ) : (
        <AnswerForm fields={form.fields} action={answerForm.bind(null, form.slug)} words={t.answer} />
      )}
    </main>
  );
}
