import { feedHeaders, rssFeed } from "../../lib/feeds.ts";

// The incidents as an RSS 2.0 feed (public).
export async function GET(): Promise<Response> {
  return new Response(await rssFeed(), { headers: feedHeaders("application/rss+xml; charset=utf-8") });
}
