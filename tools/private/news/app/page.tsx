import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import { Mark } from "../components/mark.tsx";
import { publicWords } from "../lib/session.ts";
import { currentLook } from "../lib/theme.ts";

// The public host's root. This tool has no public part: whoever lands here
// is told where the tool lives, in their language (the company's logo in
// brand mode, the News mark otherwise).
export default async function PublicHome() {
  const [{ t, locale }, look] = await Promise.all([publicWords(), currentLook()]);
  return (
    <main className="page public">
      <div className="brand"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.meta.name}</span></div>
      <h1>{t.public.title}</h1>
      <p>{t.public.body}</p>
      <LanguageSwitch languages={storeLanguages} current={locale} label={t.public.language} />
    </main>
  );
}
