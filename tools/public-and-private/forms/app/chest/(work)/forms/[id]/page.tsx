import { headers } from "next/headers";
import { atLeast } from "../../../../../lib/access.ts";
import { db } from "../../../../../lib/db.ts";
import { unpublished } from "../../../../../lib/forms.ts";
import { formLink } from "../../../../../lib/public-origin.ts";
import { formOr404 } from "../../../../../lib/pages.ts";
import { viewer } from "../../../../../lib/session.ts";
import { Builder } from "./builder.tsx";

// The Questions tab: the builder and its live preview.
export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale } = v;
  const { form, level } = await formOr404(v.member, (await params).id);
  return (
    <Builder
      id={form.id}
      slug={form.slug}
      draft={form.draft}
      revision={form.revision}
      version={form.version}
      unpublished={await unpublished(db(), form)}
      status={form.status}
      canEdit={atLeast(level, "editor")}
      layout={form.layout}
      accent={form.accent}
      anonymous={form.anonymous}
      link={formLink(await headers(), form)}
      words={{ b: t.builder, respond: t.respond, errors: t.errors, share: t.share }}
      locale={locale}
    />
  );
}
