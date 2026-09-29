import * as chest from "@argentic/chest-sdk/chest";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RespondFrame, RespondNotice } from "../../components/respond-frame.tsx";
import { Runner } from "../../components/runner.tsx";
import { db } from "../../lib/db.ts";
import { currentLook } from "../../lib/look.ts";
import { zonedParts } from "../../lib/zone.ts";
import { bySlug, openState } from "../../lib/forms.ts";
import { formToken } from "../../lib/guard.ts";
import { catalogue, format } from "../../lib/i18n/index.ts";
import { imageUrl, pictureUrls } from "../../lib/images.ts";
import { prefill } from "../../lib/logic.ts";
import { languageFor, languages, localize } from "../../lib/model.ts";
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

// A public form: anyone with the link answers it, without an account. Its
// page speaks one language: the visitor's when the form has it (its first
// language or its second version), the form's own otherwise — so the
// buttons never speak French around English questions.
export default async function PublicForm({ params, searchParams }: Props) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  const { form } = found;
  const wanted = await publicWords();
  const locale = languageFor(found.definition, wanted.locale);
  const t = catalogue(locale);
  const definition = localize(found.definition, locale);
  const company = chest.company() || t.public.title;
  const offered = found.definition.language ? [found.definition.language, ...(found.definition.alt ? [found.definition.alt.language] : [])] : languages;
  const state = openState(form);
  const query = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return (
    <RespondFrame accent={form.accent} company={company} logo={(await currentLook()).logo} locale={locale} languages={offered} languageLabel={t.public.language} back={`/${slug}`} footer={format(t.respond.footer, { company })}>
      {state.open ? (
        <Runner
          definition={definition}
          version={form.version}
          layout={form.layout}
          accent={form.accent}
          mode="public"
          slug={slug}
          anonymous={false}
          initial={{ ...prefill(found.definition, query), ...prefill(definition, query) }}
          thanks={{ title: form.thanksTitle, body: form.thanksBody }}
          redirectUrl={form.redirectUrl}
          words={{ ...t.respond, date: t.date, files: t.files }}
          today={zonedParts(new Date(), chest.timeZone()).day}
          errors={t.errors}
          locale={locale}
          token={formToken()}
          grantUrl="/api/upload"
          send={answerPublic}
          pictures={await pictureUrls(definition, "public")}
          cover={await imageUrl(form.cover, "public")}
        />
      ) : (
        <RespondNotice title={t.respond.closed.title} body={state.reason === "full" ? t.respond.closed.full : state.reason === "date" ? t.respond.closed.date : t.respond.closed.body} />
      )}
    </RespondFrame>
  );
}
