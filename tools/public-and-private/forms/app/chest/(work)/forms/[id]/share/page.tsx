import { chest } from "@argentic/chest-sdk/chest";
import { headers } from "next/headers";
import { atLeast, can } from "../../../../../../lib/access.ts";
import { db } from "../../../../../../lib/db.ts";
import { openState, team, versionOf } from "../../../../../../lib/forms.ts";
import { nameOf, people } from "../../../../../../lib/people.ts";
import { embedSites } from "../../../../../../lib/embed.ts";
import { formLink } from "../../../../../../lib/public-origin.ts";
import { formOr404 } from "../../../../../../lib/pages.ts";
import { viewer } from "../../../../../../lib/session.ts";
import { zonedParts } from "../../../../../../lib/zone.ts";
import { formSlots } from "../../../../../../lib/model.ts";
import { ownLook, publicLook } from "../../../../../../lib/theme.ts";
import { ShareView } from "./share-view.tsx";

// Share: the link (and a prefilled one), and the people who may open the
// form besides its owner.
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  const sql = db();
  const { form, level } = await formOr404(member, (await params).id);
  const def = form.version > 0 ? await versionOf(sql, form.id, form.version) : null;
  const { owner, shared } = await team(sql, form.id);
  const who = await people([owner, ...shared.map(s => s.member)]);
  const questions = (def?.pages.flatMap(p => p.questions) ?? []).filter(q => !["statement", "file", "matrix", "ranking"].includes(q.kind)).map(q => ({ id: q.id, key: q.key ?? null, title: q.title, kind: q.kind, options: (q.options ?? []).map(o => o.label) }));
  // A manager opens and changes every form, whatever it was shared as.
  const managerOf = (id: string) => who.get(id)?.role === "manager";
  // The website's button: the form's colour as its page shows it (light).
  const look = await publicLook();
  const light = look.theme.light;
  const byLook = form.accent === "berry" && !ownLook(look);
  const slot = formSlots[form.accent] as 1 | 2 | 3 | 5 | 6 | 8;
  const colour = byLook ? { fill: light.accent, ink: light["accent-ink"] } : { fill: light[`cat-${slot}-ink`], ink: light.surface };
  return (
    <ShareView
      formId={form.id}
      link={def ? formLink(await headers(), form) : null}
      open={openState(form).open}
      audience={form.audience}
      questions={questions}
      owner={{ id: owner, name: owner === member.id ? t.people.you : nameOf(who.get(owner), locale), photo: who.get(owner)?.photo ?? null }}
      shared={shared.map(s => ({ id: s.member, level: s.level === "editor" ? "editor" as const : "viewer" as const, manager: managerOf(s.member), name: s.member === member.id ? t.people.you : nameOf(who.get(s.member), locale), photo: who.get(s.member)?.photo ?? null }))}
      taken={[owner, ...shared.map(s => s.member)]}
      canManage={atLeast(level, "owner")}
      embed={form.audience === "public" ? { sites: await embedSites(sql), canEdit: can(member, "forms.all"), title: def?.title ?? form.draft.title, colour } : null}
      today={zonedParts(new Date(), chest.timeZone).day}
      locale={locale}
      t={{ share: t.share, levels: t.levels, errors: t.errors, yes: t.respond.yes, no: t.respond.no, date: t.date, peoplePicker: t.peoplePicker }}
    />
  );
}
