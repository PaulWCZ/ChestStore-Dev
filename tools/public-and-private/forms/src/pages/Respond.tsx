import { Island } from "@argentic/chest-app";
import { Back } from "../components/icons.tsx";
import { RespondFrame, RespondNotice } from "../components/respond-frame.tsx";
import { catalogue, format, type Locale } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { fail } from "../lib/app-error.ts";
import { bySlug, openState, type Form } from "../lib/forms.ts";
import { imageUrl, pictureUrls } from "../lib/images.ts";
import { companyName } from "../lib/public-origin.ts";
import { sheetOf } from "../lib/theme.ts";
import { prefill } from "../shared/logic.ts";
import { languageFor, languages, localize, type Definition } from "../shared/model.ts";
import { zonedParts } from "../shared/zone.ts";
import type { Ctx, PublicCtx } from "./context.ts";

type Query = (name: string) => string | undefined;

// What the runner of a form receives, in the language its page speaks.
async function runner(form: Form, found: Definition, locale: Locale, mode: "public" | "team", query: URLSearchParams, zone: string, host: "public" | "team") {
  const t = catalogue(locale);
  const definition = localize(found, locale);
  const given = Object.fromEntries([...query].filter(([k]) => k.length <= 40));
  return {
    definition,
    version: form.version,
    layout: form.layout,
    accent: form.accent,
    mode,
    slug: form.slug,
    anonymous: form.anonymous,
    initial: { ...prefill(found, given), ...prefill(definition, given) },
    thanks: { title: form.thanksTitle, body: form.thanksBody },
    redirectUrl: form.redirectUrl,
    words: { ...t.respond, date: t.kit.date, files: t.kit.files },
    today: zonedParts(new Date(), zone).day,
    errors: t.errors,
    locale,
    pictures: await pictureUrls(definition, host),
    cover: await imageUrl(form.cover, host),
  };
}

const closedBody = (form: Form, t: ReturnType<typeof catalogue>) => {
  const state = openState(form);
  return state.reason === "full" ? t.respond.closed.full : state.reason === "date" ? t.respond.closed.date : t.respond.closed.body;
};

// A public form: anyone with the link answers it, without an account. Its
// page speaks one language: the visitor's when the form has it (its first
// language or its second version), the form's own otherwise — so the
// buttons never speak French around English questions.
export async function publicFormPage({ sql, lang, zone, param, url }: PublicCtx) {
  const found = await bySlug(sql, param("slug"));
  if (!found || found.form.audience !== "public") return fail("not_found");
  const { form, definition } = found!;
  const locale = languageFor(definition, lang);
  const t = catalogue(locale);
  const company = companyName();
  const offered = definition.language ? [definition.language, ...(definition.alt ? [definition.alt.language] : [])] : languages;
  const logo = (await sheetOf("public")).look.logo;
  return {
    title: localize(definition, locale).title || t.builder.untitled,
    exactTitle: true,
    locale,
    head: definition.intro ? <meta name="description" content={definition.intro.slice(0, 160)} /> : undefined,
    body: (
      <RespondFrame accent={form.accent} company={company || t.public.title} logo={logo} locale={locale} languages={offered} languageLabel={t.public.language} back={`/${form.slug}`} footer={format(t.respond.footer, { company: company || t.public.title })}>
        {openState(form).open
          ? <Island id={`runner-${form.slug}`} name="Runner" props={await runner(form, definition, locale, "public", url.searchParams, zone, "public")} />
          : <RespondNotice title={t.respond.closed.title} body={closedBody(form, t)} />}
      </RespondFrame>
    ),
  };
}

// A team form, answered in the Chest: the member is who the Chest says;
// an anonymous form keeps nothing that names them. Drawn as respondents
// see it (the layout leaves out the tool's bar: layout.respond).
export async function teamFormPage({ sql, member, lang, zone, param, url }: Ctx) {
  const found = await bySlug(sql, param("slug"));
  if (!found || found.form.audience !== "team" || !can(member, "forms.answer")) return fail("not_found");
  const { form, definition } = found!;
  // The member's language when the form has it, the form's own otherwise.
  const locale = languageFor(definition, lang);
  const t = catalogue(locale);
  let already = false;
  if (form.once) {
    const [row] = form.anonymous
      ? await sql`select 1 from participants where form_id = ${form.id} and member = ${member.id}`
      : await sql`select 1 from answers where form_id = ${form.id} and respondent = ${member.id} and deleted_at is null`;
    already = Boolean(row);
  }
  const home = <a className="button quiet" href="/chest">{t.respond.thanks.home}</a>;
  const back = <a className="respond-back" href="/chest"><Back />{t.meta.name}</a>;
  const logo = (await sheetOf("team")).look.logo;
  return {
    title: localize(definition, locale).title || t.builder.untitled,
    locale,
    layout: { respond: true },
    body: (
      <RespondFrame accent={form.accent} company={companyName() || t.public.title} logo={logo} locale={locale} footer={t.respond.footerTeam} aside={back}>
        {already ? <RespondNotice title={t.respond.already.title} body={t.respond.already.body}>{home}</RespondNotice>
          : openState(form).open ? <Island id={`runner-${form.slug}`} name="Runner" props={await runner(form, definition, locale, "team", url.searchParams, zone, "team")} />
          : <RespondNotice title={t.respond.closed.title} body={closedBody(form, t)}>{home}</RespondNotice>}
      </RespondFrame>
    ),
  };
}

// The public host's root. Forms are reached by their own link only (a form
// is never listed for strangers): whoever lands here is told so, in their
// language.
export async function publicHomePage({ t, lang }: PublicCtx) {
  const company = companyName();
  const logo = (await sheetOf("public")).look.logo;
  return {
    title: t.public.title,
    body: (
      <RespondFrame accent="berry" company={company || t.public.title} logo={logo} locale={lang} languageLabel={t.public.language} footer={company ? format(t.respond.footer, { company }) : t.meta.tagline}>
        <RespondNotice title={t.public.title} body={t.public.body} />
      </RespondFrame>
    ),
  };
}

export type { Query };
