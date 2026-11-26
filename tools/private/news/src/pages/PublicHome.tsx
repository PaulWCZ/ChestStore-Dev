import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import { Mark } from "../components/mark.tsx";
import type { PageContext, View } from "@argentic/chest-app";
import type { VisitorContext } from "@argentic/chest-app";
import { sheetOf } from "../theme.ts";

// The host's root. This tool has no public part (a Chest answers 404 on
// its public host): whoever lands here without a Chest is told where the
// tool lives, in their language (the company's logo in brand mode, the
// News mark otherwise).
export async function publicHome({ t, locale }: PageContext<VisitorContext>): Promise<View> {
  const { look } = await sheetOf("public");
  return {
    title: t.tool.name,
    body: (
      <>
        <div className="brand"><BrandMark logo={look.logo}><Mark /></BrandMark><span>{t.tool.name}</span></div>
        <h1>{t.public.title}</h1>
        <p>{t.public.body}</p>
        <LanguageSwitch languages={storeLanguages} current={locale} label={t.public.language} />
      </>
    ),
  };
}
