import { Island } from "@argentic/chest-app";
import { atLeast, can } from "../lib/access.ts";
import { embedSites } from "../lib/embed.ts";
import { open, openState, team, versionOf } from "../lib/forms.ts";
import { nameOf, people } from "../lib/people.ts";
import { formLink } from "../lib/public-origin.ts";
import { ownLook, publicLook } from "../lib/theme.ts";
import { formSlots } from "../shared/model.ts";
import { zonedParts } from "../shared/zone.ts";
import type { Ctx } from "./context.ts";
import { FormFrame } from "./form-frame.tsx";

// Share: the link (and a prefilled one), the code for the company's
// website, and the people who may open the form besides its owner.
export async function sharePage({ sql, member, t, lang, zone, param }: Ctx) {
  const { form, level } = await open(sql, member, param("id"));
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
  return {
    title: form.draft.title || t.builder.untitled,
    body: (
      <FormFrame form={form} level={level} tab="share" t={t} lang={lang}>
        <Island id={`share-${form.id}`} name="Share" props={{
          formId: form.id,
          link: def ? formLink(form) : null,
          open: openState(form).open,
          audience: form.audience,
          questions,
          owner: { id: owner, name: owner === member.id ? t.people.you : nameOf(who.get(owner), lang), photo: who.get(owner)?.photo ?? null },
          shared: shared.map(s => ({ id: s.member, level: s.level === "editor" ? "editor" as const : "viewer" as const, manager: managerOf(s.member), name: s.member === member.id ? t.people.you : nameOf(who.get(s.member), lang), photo: who.get(s.member)?.photo ?? null })),
          taken: [owner, ...shared.map(s => s.member)],
          canManage: atLeast(level, "owner"),
          embed: form.audience === "public" ? { sites: await embedSites(sql), canEdit: can(member, "forms.all"), title: def?.title ?? form.draft.title, colour } : null,
          today: zonedParts(new Date(), zone).day,
          locale: lang,
          t: { share: t.share, levels: t.levels, yes: t.respond.yes, no: t.respond.no, date: t.kit.date, peoplePicker: t.kit.peoplePicker },
        }} />
      </FormFrame>
    ),
  };
}
