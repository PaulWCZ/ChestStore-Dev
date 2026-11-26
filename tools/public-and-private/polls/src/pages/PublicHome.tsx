import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import type { Look } from "@argentic/chest-ui/runtime";
import { Mark } from "../components/mark.tsx";
import { locales, type Catalogue, type Locale } from "../i18n/index.ts";

// The public host's root, /: Polls' public part is the guest page of a
// date poll (/p/<link>); whoever lands here is told where the tool lives,
// in their language. In brand mode the company's logo stands where the
// Polls mark is.
export function PublicHome({ look, locale, t }: { look: Look; locale: Locale; t: Catalogue }) {
  return (
    <>
      <div className="brand"><BrandMark logo={look.logo}><Mark /></BrandMark>{t.tool.name}</div>
      <h1>{t.public.title}</h1>
      <p>{t.public.body}</p>
      <LanguageSwitch languages={storeLanguages.filter(l => (locales as readonly string[]).includes(l.code))} current={locale} label={t.pages.language} back="/" />
    </>
  );
}
