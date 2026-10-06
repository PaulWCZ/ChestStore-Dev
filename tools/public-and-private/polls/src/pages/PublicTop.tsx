import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import { Mark } from "../components/mark.tsx";
import { locales, type Catalogue, type Locale } from "../i18n/index.ts";

// The top of a public page: the brand — the company's logo in brand mode
// (it says the name already), else Polls' mark and a name — and the
// language switch, which comes back to this page (back).
export function PublicTop({ logo, name, locale, back, t }: { logo: { url: string; alt: string; dark?: string | null } | null; name: string; locale: Locale; back: string; t: Catalogue }) {
  return (
    <div className="guest-top">
      <div className="brand"><BrandMark logo={logo}><Mark /></BrandMark>{logo ? null : name}</div>
      <LanguageSwitch languages={storeLanguages.filter(l => (locales as readonly string[]).includes(l.code))} current={locale} label={t.pages.language} back={back} />
    </div>
  );
}
