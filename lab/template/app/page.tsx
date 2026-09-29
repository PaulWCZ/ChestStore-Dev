import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { Mark } from "../components/mark.tsx";
import { languageNames, locales } from "../lib/i18n/index.ts";
import { publicWords } from "../lib/session.ts";
import { currentLook } from "../lib/theme.ts";

// The public host's root. This tool has no public part: whoever lands here
// is told where the tool lives, in their language.
export default async function PublicHome() {
  const [{ t, locale }, look] = await Promise.all([publicWords(), currentLook()]);
  return (
    <main className="page public">
      <div className="brand"><BrandMark logo={look.logo}><Mark /></BrandMark>{t.meta.name}</div>
      <h1>{t.public.title}</h1>
      <p>{t.public.body}</p>
      <LanguageSwitch languages={locales.map(code => ({ code, name: languageNames[code] }))} current={locale} label={t.public.language} />
    </main>
  );
}
