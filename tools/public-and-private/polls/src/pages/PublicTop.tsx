import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import type { Look } from "@argentic/chest-ui/runtime";
import { Mark } from "../components/mark.tsx";
import { locales, type Catalogue, type Locale } from "../i18n/index.ts";

// The top of a public page: the brand — the company's logo in brand mode
// (it says the name already), else Polls' mark and a name — and the
// language switch, which comes back to this page (back).
export function PublicTop({ look, name, locale, back, t }: { look: Look; name: string; locale: Locale; back: string; t: Catalogue }) {
  return (
    <div className="guest-top">
      <div className="brand"><BrandMark logo={look.logo}><Mark /></BrandMark>{look.logo ? null : name}</div>
      <LanguageSwitch languages={storeLanguages.filter(l => (locales as readonly string[]).includes(l.code))} current={locale} label={t.public.language} back={back} />
    </div>
  );
}
