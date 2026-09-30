import { chest } from "@argentic/chest-sdk/chest";
import { RespondFrame, RespondNotice } from "../components/respond-frame.tsx";
import { format } from "../lib/i18n/index.ts";
import { publicWords } from "../lib/session.ts";
import { currentLook } from "../lib/look.ts";

// The public host's root. Forms are reached by their own link only (a form
// is never listed for strangers): whoever lands here is told so, in their
// language.
export default async function PublicHome() {
  const { t, locale } = await publicWords();
  const company = chest.organization.name;
  return (
    <RespondFrame accent="berry" company={company || t.public.title} logo={(await currentLook()).logo} locale={locale} languageLabel={t.public.language} footer={company ? format(t.respond.footer, { company }) : t.meta.tagline}>
      <RespondNotice title={t.public.title} body={t.public.body} />
    </RespondFrame>
  );
}
