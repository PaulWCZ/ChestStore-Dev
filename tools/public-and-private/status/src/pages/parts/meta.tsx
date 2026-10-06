import { format } from "../../i18n/index.ts";
import type { PublicContext } from "../../lib/public-page.ts";

// The public page's title: the company's ("Atelier Martin status"), and a
// page's own before it ("History — Atelier Martin status").
export function siteTitle({ t, company }: Pick<PublicContext, "t" | "company">, page?: string): string {
  const site = company ? format(t.meta.publicTitle, { company }) : t.meta.publicPlain;
  return page ? `${page} — ${site}` : site;
}

// What search engines may do: index the status page, its history and its
// incidents; never a subscriber's page or a form (the team's part says
// noindex for all of it: src/app.tsx).
export const indexed = (description?: string) => (
  <>
    <meta name="robots" content="index, follow" />
    {description && <meta name="description" content={description} />}
  </>
);
export const unindexed = <meta name="robots" content="noindex, nofollow" />;
