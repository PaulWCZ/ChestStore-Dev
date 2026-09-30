import { chest } from "@argentic/chest-sdk/chest";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RespondFrame, RespondNotice } from "../../../../components/respond-frame.tsx";
import { Back } from "../../../../components/icons.tsx";
import { Runner } from "../../../../components/runner.tsx";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { currentLook } from "../../../../lib/look.ts";
import { zonedParts } from "../../../../lib/zone.ts";
import { bySlug, openState } from "../../../../lib/forms.ts";

import { catalogue } from "../../../../lib/i18n/index.ts";
import { imageUrl, pictureUrls } from "../../../../lib/images.ts";
import { prefill } from "../../../../lib/logic.ts";
import { languageFor, localize } from "../../../../lib/model.ts";
import { viewer } from "../../../../lib/session.ts";
import { answerTeam } from "../../actions.ts";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await bySlug(db(), (await params).slug);
  return found && found.form.audience === "team" ? { title: found.definition.title } : {};
}

// A team form, answered in the Chest: the member is who the Chest says
// (member(request)); an anonymous form keeps nothing that names them.
export default async function TeamForm({ params, searchParams }: Props) {
  const v = await viewer();
  if (!v) return null;
  const { member } = v;
  const { slug } = await params;
  const sql = db();
  const found = await bySlug(sql, slug);
  if (!found || found.form.audience !== "team" || !can(member, "forms.answer")) notFound();
  const { form } = found;
  // The member's language when the form has it, the form's own otherwise.
  const locale = languageFor(found.definition, v.locale);
  const t = catalogue(locale);
  const definition = localize(found.definition, locale);
  const state = openState(form);
  let already = false;
  if (form.once) {
    const [row] = form.anonymous
      ? await sql`select 1 from participants where form_id = ${form.id} and member = ${member.id}`
      : await sql`select 1 from answers where form_id = ${form.id} and respondent = ${member.id} and deleted_at is null`;
    already = Boolean(row);
  }
  const query = Object.fromEntries(Object.entries(await searchParams).map(([k, val]) => [k, Array.isArray(val) ? val[0] : val]));
  const company = chest.organization.name;
  const home = <a className="button quiet" href="/chest">{t.respond.thanks.home}</a>;
  const back = <a className="respond-back" href="/chest"><Back />{t.meta.name}</a>;
  return (
    <RespondFrame accent={form.accent} company={company} logo={(await currentLook()).logo} locale={locale} footer={t.respond.footerTeam} aside={back}>
      {already ? (
        <RespondNotice title={t.respond.already.title} body={t.respond.already.body}>{home}</RespondNotice>
      ) : state.open ? (
        <Runner
          definition={definition}
          version={form.version}
          layout={form.layout}
          accent={form.accent}
          mode="team"
          slug={slug}
          anonymous={form.anonymous}
          initial={{ ...prefill(found.definition, query), ...prefill(definition, query) }}
          thanks={{ title: form.thanksTitle, body: form.thanksBody }}
          redirectUrl={form.redirectUrl}
          words={{ ...t.respond, date: t.date, files: t.files }}
          today={zonedParts(new Date(), chest.timeZone).day}
          errors={t.errors}
          locale={locale}
          grantUrl="/chest/api/upload"
          send={answerTeam}
          pictures={await pictureUrls(definition, "team")}
          cover={await imageUrl(form.cover, "team")}
        />
      ) : (
        <RespondNotice title={t.respond.closed.title} body={state.reason === "full" ? t.respond.closed.full : state.reason === "date" ? t.respond.closed.date : t.respond.closed.body}>{home}</RespondNotice>
      )}
    </RespondFrame>
  );
}
