import type { PageContext, View, VisitorContext } from "@argentic/chest-app";
import { LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import { locales } from "../i18n/index.ts";

// The host's root. Rooms has no public part (a Chest answers 404 there
// itself): whoever lands here outside a Chest is told where the tool
// lives, in their language (the layout draws the mark, or the company's
// logo in brand mode).
export function publicHome({ locale, t }: PageContext<VisitorContext>): View {
  const languages = storeLanguages.filter(l => (locales as readonly string[]).includes(l.code));
  return {
    title: t.public.title,
    body: (
      <>
        <h1>{t.public.title}</h1>
        <p>{t.public.body}</p>
        <LanguageSwitch languages={languages} current={locale} label={t.public.language} />
      </>
    ),
  };
}
