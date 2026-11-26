import { Island } from "@argentic/chest-app";
import { catalogue } from "../i18n/index.ts";
import { atLeast } from "../lib/access.ts";
import { open, unpublished } from "../lib/forms.ts";
import { imageUrl, pictureUrls } from "../lib/images.ts";
import { formLink } from "../lib/public-origin.ts";
import { zonedParts } from "../shared/zone.ts";
import type { Ctx } from "./context.ts";
import { FormFrame } from "./form-frame.tsx";

// The Questions tab: the builder and its live preview (in either of the
// form's languages: both catalogues' respondent words).
export async function buildPage({ sql, member, t, lang, zone, param, query }: Ctx) {
  const { form, level } = await open(sql, member, param("id"));
  const en = catalogue("en"), fr = catalogue("fr");
  // Just imported: what came, and what could not (logic, pictures…).
  const imported = query("imported");
  const left = imported !== undefined ? imported.split(",").filter((k): k is keyof typeof t.create.skipped => Object.hasOwn(t.create.skipped, k)) : null;
  return {
    title: form.draft.title || t.builder.untitled,
    body: (
      <FormFrame form={form} level={level} tab="build" t={t} lang={lang}>
        <Island id={`builder-${form.id}`} name="Builder" props={{
          id: form.id,
          slug: form.slug,
          draft: form.draft,
          revision: form.revision,
          version: form.version,
          unpublished: await unpublished(sql, form),
          status: form.status,
          canEdit: atLeast(level, "editor"),
          layout: form.layout,
          accent: form.accent,
          anonymous: form.anonymous,
          link: formLink(form),
          words: { b: t.builder, respond: { en: { ...en.respond, date: en.kit.date, files: en.kit.files }, fr: { ...fr.respond, date: fr.kit.date, files: fr.kit.files } }, errors: { en: en.errors, fr: fr.errors }, share: t.share, dialog: t.kit.dialog },
          today: zonedParts(new Date(), zone).day,
          locale: lang,
          pictures: await pictureUrls(form.draft, "team"),
          cover: await imageUrl(form.cover, "team"),
          imported: left === null ? null : left.length === 0 ? t.create.importedAll : `${t.create.importedSome} ${left.map(k => t.create.skipped[k]).join(", ")}.`,
        }} />
      </FormFrame>
    ),
  };
}
