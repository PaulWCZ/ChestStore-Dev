import { notFound } from "next/navigation";
import { fill } from "../../../../lib/i18n.ts";
import { forms, words } from "../../../../lib/session.ts";

export default async function Thanks({ params }: { params: Promise<{ slug: string }> }) {
  const form = await forms.publicForm((await params).slug);
  if (!form) notFound();
  const t = await words();
  return (
    <main className="page public">
      <h1>{t.thanks.title}</h1>
      <p>{fill(t.thanks.body, { title: form.title })}</p>
    </main>
  );
}
