import { badge, brandLabel, labelColour } from "../../lib/badge.ts";
import { catalogue, isLocale, publicLocale } from "../../lib/i18n/index.ts";
import { publicSummary } from "../../lib/public-summary.ts";
import { currentLook } from "../../lib/theme.ts";

// The status badge (lib/badge.ts): <img src="…/badge.svg"> on any site.
// Its state colours never change; its label wears the company's colour
// when the Chest gives its brand (and white reads on it).
// ?lang=fr or ?lang=en chooses its words; without it, the reader's browser
// languages do. Kept a minute by caches, per language.
export async function GET(request: Request): Promise<Response> {
  const asked = new URL(request.url).searchParams.get("lang");
  const locale = isLocale(asked) ? asked : publicLocale(undefined, request.headers.get("accept-language"));
  const t = catalogue(locale);
  const [{ state }, look] = await Promise.all([publicSummary(), currentLook()]);
  const message = state === "none" ? t.public.badgeSetup : t.banner[state];
  return new Response(badge(t.public.badgeLabel, message, state, `${t.public.badgeLabel}: ${message}`, brandLabel(look) ?? labelColour), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      ...(isLocale(asked) ? {} : { Vary: "Accept-Language" }),
      "Access-Control-Allow-Origin": "*",
      "Content-Security-Policy": "default-src 'none'; style-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
