import * as chest from "@argentic/chest-sdk/chest";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RespondFrame, RespondNotice } from "../../components/respond-frame.tsx";
import { Runner } from "../../components/runner.tsx";
import { db } from "../../lib/db.ts";
import { bySlug, openState } from "../../lib/forms.ts";
import { formToken } from "../../lib/guard.ts";
import { format } from "../../lib/i18n/index.ts";
import { prefill } from "../../lib/logic.ts";
import { publicWords } from "../../lib/session.ts";
import { answerPublic } from "../public-actions.ts";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(slug: string) {
  const found = await bySlug(db(), slug);
  return found && found.form.audience === "public" ? found : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).slug);
  const { t } = await publicWords();
  return { title: found ? found.definition.title : t.notFound.formTitle, description: found?.definition.intro.slice(0, 160) || undefined };
}

// A public form: anyone with the link answers it, without an account, in
// their language for the tool's words (the questions are the author's).
export default async function PublicForm({ params, searchParams }: Props) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  const { form, definition } = found;
  const { t, locale } = await publicWords();
  const company = chest.company() || t.public.title;
  const state = openState(form);
  const query = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return (
    <RespondFrame accent={form.accent} company={company} locale={locale} languageLabel={t.public.language} back={`/${slug}`} footer={format(t.respond.footer, { company })}>
      {state.open ? (
        <Runner
          definition={definition}
          version={form.version}
          layout={form.layout}
          accent={form.accent}
          mode="public"
          slug={slug}
          anonymous={false}
          initial={prefill(definition, query)}
          thanks={{ title: form.thanksTitle, body: form.thanksBody }}
          redirectUrl={form.redirectUrl}
          words={t.respond}
          errors={t.errors}
          locale={locale}
          token={formToken()}
          grantUrl="/api/upload"
          send={answerPublic}
        />
      ) : (
        <RespondNotice title={t.respond.closed.title} body={state.reason === "full" ? t.respond.closed.full : state.reason === "date" ? t.respond.closed.date : t.respond.closed.body} />
      )}
    </RespondFrame>
  );
}
