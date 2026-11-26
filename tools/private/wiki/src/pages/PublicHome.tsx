import type { PageContext, View, VisitorContext } from "@argentic/chest-app";
import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import { Mark } from "../components/mark.tsx";
import { locales } from "../i18n/index.ts";
import { sheetOf } from "../theme.ts";

// The public host's root. This tool has no public part: whoever lands here
// is told where the tool lives, in their language (the kit's switch, each
// language named in itself). In brand mode, the company's logo.
export async function publicHome({ t, locale }: PageContext<VisitorContext>): Promise<View> {
  const { look } = await sheetOf("public");
  return { title: t.tool.name, body: (
    <>
      <div className="brand"><BrandMark logo={look.logo}><Mark /></BrandMark>{t.tool.name}</div>
      <h1>{t.public.title}</h1>
      <p>{t.public.body}</p>
      <LanguageSwitch languages={storeLanguages.filter(l => (locales as readonly string[]).includes(l.code))} current={locale} label={t.public.language} />
    </>
  ) };
}
