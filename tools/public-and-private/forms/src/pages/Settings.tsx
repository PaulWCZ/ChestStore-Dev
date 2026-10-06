import { Island } from "@argentic/chest-app";
import { format } from "../i18n/index.ts";
import { atLeast } from "../lib/access.ts";
import { open, team, versionOf } from "../lib/forms.ts";
import { hooksOf } from "../lib/hooks.ts";
import { imageUrl } from "../lib/images.ts";
import { links, mailState } from "../lib/linked.ts";
import { nameOf, people } from "../lib/people.ts";
import { contactSlots, guessRoutes, requestSlots } from "../lib/routes.ts";
import { ownLook, publicLook, teamLook } from "../lib/theme.ts";
import type { RouteChoices } from "../islands/Settings.tsx";
import { allQuestions, readIn } from "../shared/model.ts";
import { zonedParts } from "../shared/zone.ts";
import type { Ctx } from "./context.ts";
import { FormFrame } from "./form-frame.tsx";

// Settings: who answers, how it looks, until when, what happens after, who
// hears of answers, where else they go, how long they are kept — and the
// form itself. For its editors only (a viewer reads the answers: open()
// refuses the others, the 403 page).
export async function settingsPage({ sql, member, t, lang, zone, param }: Ctx) {
  const { form, level } = await open(sql, member, param("id"), "editor");
  const { owner, shared, watchers } = await team(sql, form.id);
  const ids = [...new Set([owner, ...shared.map(s => s.member)])].filter(id => id.startsWith("mbr_"));
  const [who, addresses, linked, mail, cover, published, look] = await Promise.all([
    people(ids),
    hooksOf(sql, member, form.id),
    links(),
    mailState(sql),
    imageUrl(form.cover, "team"),
    form.version > 0 ? versionOf(sql, form.id, form.version) : null,
    // A public form wears the public look (brand or Forms' own), a team form the team's.
    form.audience === "public" ? publicLook() : teamLook(),
  ]);
  const closes = form.closesAt ? zonedParts(new Date(form.closesAt), zone) : null;
  const { taken } = (await sql<{ taken: boolean }[]>`select exists (select 1 from answers where form_id = ${form.id}) or exists (select 1 from participants where form_id = ${form.id}) as taken`)[0]!;
  const hasFiles = [...allQuestions(form.draft), ...(published ? allQuestions(published) : [])].some(q => q.kind === "file");
  // The questions each piece of a contact or a ticket may come from.
  const questions = allQuestions(readIn(form.draft, lang)).map((q, i) => ({ id: q.id, kind: q.kind, title: q.title || format(t.builder.untitledQuestion, { n: i + 1 }) }));
  const eligible = (kinds: readonly string[]) => questions.filter(q => kinds.includes(q.kind)).map(({ id, title }) => ({ id, title }));
  const routeChoices = {
    contact: Object.fromEntries(Object.entries(contactSlots).map(([k, kinds]) => [k, eligible(kinds)])),
    request: Object.fromEntries(Object.entries(requestSlots).map(([k, kinds]) => [k, eligible(kinds)])),
  } as RouteChoices;
  return {
    title: form.draft.title || t.builder.untitled,
    body: (
      <FormFrame form={form} level={level} tab="settings" t={t} lang={lang}>
        <Island id={`settings-${form.id}`} name="Settings" props={{
          routeGuess: guessRoutes(form.draft),
          links: linked,
          hooks: { delivery: addresses.delivery, list: addresses.hooks },
          formId: form.id,
          canEdit: atLeast(level, "editor"),
          canDelete: atLeast(level, "owner"),
          mail,
          cover,
          initial: {
            audience: form.audience, anonymous: form.anonymous, once: form.once, tellTeam: form.tellTeam, layout: form.layout, accent: form.accent,
            closesDay: closes?.day ?? "", closesHour: closes?.hour ?? 18, maxAnswers: form.maxAnswers === null ? "" : String(form.maxAnswers),
            thanksTitle: form.thanksTitle, thanksBody: form.thanksBody, redirectUrl: form.redirectUrl ?? "", sendCopy: form.sendCopy,
            retentionMonths: form.retentionMonths === null ? "" : String(form.retentionMonths), watchers,
            notifyEmail: form.notifyEmail, shareEvents: form.shareEvents, routes: form.routes,
          },
          routeChoices,
          anonymityLocked: taken,
          hasFiles,
          people: ids.map(id => ({ id, name: id === member.id ? t.people.you : nameOf(who.get(id), lang) })),
          zoneNote: format(t.settings.zone, { zone }),
          locale: lang,
          today: zonedParts(new Date(), zone).day,
          own: ownLook(look),
          t: { s: t.settings, errors: t.errors, b: t.builder, date: t.kit.date, dialog: t.kit.dialog },
        }} />
      </FormFrame>
    ),
  };
}
