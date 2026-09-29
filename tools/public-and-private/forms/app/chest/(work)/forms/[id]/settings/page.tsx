import * as chest from "@argentic/chest-sdk/chest";
import { atLeast } from "../../../../../../lib/access.ts";
import { db } from "../../../../../../lib/db.ts";
import { team, versionOf } from "../../../../../../lib/forms.ts";
import { format } from "../../../../../../lib/i18n/index.ts";
import { allQuestions } from "../../../../../../lib/model.ts";
import { nameOf, people } from "../../../../../../lib/people.ts";
import { formOr404 } from "../../../../../../lib/pages.ts";
import { viewer } from "../../../../../../lib/session.ts";
import { zonedParts } from "../../../../../../lib/zone.ts";
import { imageUrl } from "../../../../../../lib/images.ts";
import { getSetting } from "../../../../../../lib/settings.ts";
import { currentLook, ownLook } from "../../../../../../lib/theme.ts";
import { SettingsView } from "./settings-view.tsx";

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
  return (
    <SettingsView
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
        notifyEmail: form.notifyEmail, shareEvents: form.shareEvents,
      }}
      anonymityLocked={taken}
      hasFiles={hasFiles}
      people={ids.map(id => ({ id, name: id === member.id ? t.people.you : nameOf(who.get(id), locale) }))}
      zoneNote={format(t.settings.zone, { zone })}
      locale={locale}
      today={zonedParts(new Date(), zone).day}
      own={ownLook(await currentLook())}
      t={{ s: t.settings, errors: t.errors, b: t.builder, date: t.date }}
    />
  );
}
