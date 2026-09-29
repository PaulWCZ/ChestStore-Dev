import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import { Mark } from "../components/mark.tsx";
import { locales } from "../lib/i18n/index.ts";
import { publicWords } from "../lib/session.ts";
import { currentLook } from "../lib/look.ts";

// The public host's root. This tool has no public part: whoever lands here
// is told where the tool lives, in their language. In brand mode the
// company's logo stands where the Polls mark is.
export default async function PublicHome() {
  const [{ t, locale }, look] = await Promise.all([publicWords(), currentLook()]);
  return (
    <main className="page public">
      <div className="brand"><BrandMark logo={look.logo}><Mark /></BrandMark>{t.meta.name}</div>
      <h1>{t.public.title}</h1>
      <p>{t.public.body}</p>
      <LanguageSwitch languages={storeLanguages.filter(l => (locales as readonly string[]).includes(l.code))} current={locale} label={t.public.language} />
    </main>
  );
}
