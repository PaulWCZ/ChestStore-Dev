import * as chest from "@argentic/chest-sdk/chest";
import { atLeast } from "../../../../../../lib/access.ts";
import { db } from "../../../../../../lib/db.ts";
import { team, versionOf } from "../../../../../../lib/forms.ts";
import { format } from "../../../../../../lib/i18n/index.ts";
import { allQuestions, readIn } from "../../../../../../lib/model.ts";
import { nameOf, people } from "../../../../../../lib/people.ts";
import { formOr404 } from "../../../../../../lib/pages.ts";
import { viewer } from "../../../../../../lib/session.ts";
import { zonedParts } from "../../../../../../lib/zone.ts";
import { imageUrl } from "../../../../../../lib/images.ts";
import { getSetting } from "../../../../../../lib/settings.ts";
import { ownLook, publicLook, teamLook } from "../../../../../../lib/theme.ts";
import { contactSlots, guessRoutes, requestSlots } from "../../../../../../lib/routes.ts";
import { hooksOf } from "../../../../../../lib/hooks.ts";
import { installed } from "../../../../../../lib/linked.ts";
import { HooksBox } from "./hooks-box.tsx";
import { SettingsView, type RouteChoices } from "./settings-view.tsx";

// Settings: who answers, how it looks, until when, what happens after, who
// hears of answers, where else they go, how long they are kept — and the
// form itself. For its editors only (a viewer reads the answers).
export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const sql = db();
  const { form, level } = await formOr404(member, (await params).id, "editor");
  const { owner, shared, watchers } = await team(sql, form.id);
  const ids = [...new Set([owner, ...shared.map(s => s.member)])].filter(id => id.startsWith("mbr_"));
  const who = await people(ids);
  const zone = chest.timeZone();
  const closes = form.closesAt ? zonedParts(new Date(form.closesAt), zone) : null;
  const { taken } = (await sql<{ taken: boolean }[]>`select exists (select 1 from answers where form_id = ${form.id}) or exists (select 1 from participants where form_id = ${form.id}) as taken`)[0]!;
  const published = form.version > 0 ? await versionOf(sql, form.id, form.version) : null;
  const hasFiles = [...allQuestions(form.draft), ...(published ? allQuestions(published) : [])].some(q => q.kind === "file");
  // The questions each piece of a contact or a ticket may come from.
  const questions = allQuestions(readIn(form.draft, locale)).map((q, i) => ({ id: q.id, kind: q.kind, title: q.title || format(t.builder.untitledQuestion, { n: i + 1 }) }));
  const eligible = (kinds: readonly string[]) => questions.filter(q => kinds.includes(q.kind)).map(({ id, title }) => ({ id, title }));
  const routeChoices = {
    contact: Object.fromEntries(Object.entries(contactSlots).map(([k, kinds]) => [k, eligible(kinds)])),
    request: Object.fromEntries(Object.entries(requestSlots).map(([k, kinds]) => [k, eligible(kinds)])),
  } as RouteChoices;
  const addresses = await hooksOf(sql, member, form.id);
  return (
    <SettingsView
      routeGuess={guessRoutes(form.draft)}
      installed={installed()}
      hooks={<HooksBox formId={form.id} available={addresses.available} hooks={addresses.hooks} anonymous={form.anonymous} canEdit={atLeast(level, "editor")} t={{ s: t.settings, errors: t.errors, dialog: t.dialog }} />}
      formId={form.id}
      canEdit={atLeast(level, "editor")}
      canDelete={atLeast(level, "owner")}
      mailWorks={(await getSetting<boolean>(sql, "mail_works")) ?? null}
      cover={await imageUrl(form.cover, "team")}
      initial={{
        audience: form.audience, anonymous: form.anonymous, once: form.once, tellTeam: form.tellTeam, layout: form.layout, accent: form.accent,
        closesDay: closes?.day ?? "", closesHour: closes?.hour ?? 18, maxAnswers: form.maxAnswers === null ? "" : String(form.maxAnswers),
        thanksTitle: form.thanksTitle, thanksBody: form.thanksBody, redirectUrl: form.redirectUrl ?? "", sendCopy: form.sendCopy,
        retentionMonths: form.retentionMonths === null ? "" : String(form.retentionMonths), watchers,
        notifyEmail: form.notifyEmail, shareEvents: form.shareEvents, routes: form.routes,
      }}
      routeChoices={routeChoices}
      anonymityLocked={taken}
      hasFiles={hasFiles}
      people={ids.map(id => ({ id, name: id === member.id ? t.people.you : nameOf(who.get(id), locale) }))}
      zoneNote={format(t.settings.zone, { zone })}
      locale={locale}
      today={zonedParts(new Date(), zone).day}
      // A public form wears the public look (brand or Forms' own), a team form the team's.
      own={ownLook(form.audience === "public" ? await publicLook() : await teamLook())}
      t={{ s: t.settings, errors: t.errors, b: t.builder, date: t.date }}
    />
  );
}
