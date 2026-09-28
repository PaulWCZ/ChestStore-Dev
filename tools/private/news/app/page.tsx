import { Mark } from "../components/mark.tsx";
import { LanguageSwitch } from "../components/language-switch.tsx";
import { publicWords } from "../lib/session.ts";

// The public host's root. This tool has no public part: whoever lands here
// is told where the tool lives, in their language.
export default async function PublicHome() {
  const { t, locale } = await publicWords();
  return (
    <main className="page public">
      <div className="brand"><Mark />{t.meta.name}</div>
      <h1>{t.public.title}</h1>
      <p>{t.public.body}</p>
      <LanguageSwitch current={locale} label={t.public.language} />
    </main>
  );
}
