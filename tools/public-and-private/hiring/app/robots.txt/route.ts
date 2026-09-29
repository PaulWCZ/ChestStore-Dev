import { headers } from "next/headers";
import { publicOrigin } from "../../lib/public-origin.ts";

// Search engines may read the careers page, never the team's part.
export async function GET(): Promise<Response> {
  const origin = publicOrigin(await headers()) ?? "";
  const body = ["User-agent: *", "Allow: /", "Disallow: /chest", "Disallow: /api/", "Disallow: /lang/", "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

// Read at each request: the jobs change, the disk is read-only.
export const dynamic = "force-dynamic";
