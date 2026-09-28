// The incidents as a feed, for people who follow the page without giving
// an address: Atom (RFC 4287) and RSS 2.0, the two every reader takes.
// Text only — titles and contents are escaped, never HTML.

export type FeedEntry = { id: string; title: string; link: string; published: Date; updated: Date; text: string };
export type Feed = { title: string; subtitle: string; link: string; self: string; updated: Date; entries: FeedEntry[] };

export function xml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu, "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

export function atom(feed: Feed): string {
  const entries = feed.entries.map(e => [
    "  <entry>",
    `    <id>${xml(e.id)}</id>`,
    `    <title type="text">${xml(e.title)}</title>`,
    `    <link rel="alternate" type="text/html" href="${xml(e.link)}"/>`,
    `    <published>${e.published.toISOString()}</published>`,
    `    <updated>${e.updated.toISOString()}</updated>`,
    `    <content type="text">${xml(e.text)}</content>`,
    "  </entry>",
  ].join("\n"));
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom">`,
    `  <id>${xml(feed.self)}</id>`,
    `  <title type="text">${xml(feed.title)}</title>`,
    `  <subtitle type="text">${xml(feed.subtitle)}</subtitle>`,
    `  <link rel="alternate" type="text/html" href="${xml(feed.link)}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${xml(feed.self)}"/>`,
    `  <updated>${feed.updated.toISOString()}</updated>`,
    `  <author><name>${xml(feed.title)}</name></author>`,
    ...entries,
    `</feed>`,
    "",
  ].join("\n");
}

export function rss(feed: Feed): string {
  const items = feed.entries.map(e => [
    "    <item>",
    `      <title>${xml(e.title)}</title>`,
    `      <link>${xml(e.link)}</link>`,
    `      <guid isPermaLink="false">${xml(e.id)}</guid>`,
    `      <pubDate>${e.updated.toUTCString()}</pubDate>`,
    `      <description>${xml(e.text)}</description>`,
    "    </item>",
  ].join("\n"));
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    "  <channel>",
    `    <title>${xml(feed.title)}</title>`,
    `    <link>${xml(feed.link)}</link>`,
    `    <description>${xml(feed.subtitle)}</description>`,
    `    <atom:link href="${xml(feed.self)}" rel="self" type="application/rss+xml"/>`,
    `    <lastBuildDate>${feed.updated.toUTCString()}</lastBuildDate>`,
    `    <ttl>5</ttl>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
