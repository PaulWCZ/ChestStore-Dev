// Safe in the browser: no SDK here.
// Reach: the careers page where job seekers look, without the tool calling
// anyone (no network). Search engines and job boards come to read:
//
// - JobPosting structured data (JSON-LD) on each job's page, which Google
//   for Jobs reads. Google's required properties: title, description,
//   datePosted, hiringOrganization, jobLocation (or, for a fully remote
//   job, jobLocationType TELECOMMUTE with applicantLocationRequirements);
//   recommended: validThrough, employmentType, baseSalary, identifier,
//   directApply (https://developers.google.com/search/docs/appearance/structured-data/job-posting,
//   read 2026-09-29 through search summaries: the page itself is not
//   reachable from the studio).
// - An XML feed in Indeed's format (/jobs.xml): <source> with publisher,
//   publisherurl, lastBuildDate, then one <job> each with title, date,
//   referencenumber, url, company, city, state, country, postalcode,
//   streetaddress, description (CDATA), salary, jobtype
//   (https://docs.indeed.com/job-sync-xml/xml-feed, read 2026-09-29 the
//   same way). Aggregators that read Indeed's format read it too.
// - An RSS 2.0 feed (/feed.xml): channel title, link, description, then an
//   item per job (https://www.rssboard.org/rss-specification).
// - A sitemap (/sitemap.xml, https://www.sitemaps.org/protocol.html) and
//   robots.txt pointing to it; the team's part is never listed.
import { parse, plain, type Inline } from "../shared/rich-text.ts";

export type ReachJob = {
  id: string;
  slug: string;
  title: string;
  team: string;
  place: string;
  contract: "permanent" | "fixed_term" | "internship" | "apprenticeship" | "freelance";
  remote: "onsite" | "hybrid" | "remote";
  hours: "full_time" | "part_time";
  description: string;
  language: string;
  openedAt: string | null;
  updatedAt: string;
  closesOn: string | null;
  country: string;
  postalCode: string;
  street: string;
  salary: { min: number | null; max: number | null; currency: string; period: "year" | "month" | "hour" } | null;
};
export type Company = { name: string; website: string; logo: string | null };

const escapeHtml = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const words = (parts: Inline[]) => parts.map(p => (p.bold ? `<strong>${escapeHtml(p.text)}</strong>` : escapeHtml(p.text))).join("");

// The description as HTML, escaped: what JobPosting and Indeed ask for.
export function descriptionHtml(source: string): string {
  return parse(source).map(b => {
    if (b.kind === "heading") return `<h2>${words(b.content)}</h2>`;
    if (b.kind === "paragraph") return `<p>${b.lines.map(words).join("<br>")}</p>`;
    const items = b.items.map(i => `<li>${words(i)}</li>`).join("");
    return b.kind === "bullets" ? `<ul>${items}</ul>` : `<ol>${items}</ol>`;
  }).join("");
}

// Google's employment types for a contract and working time.
export function employmentTypes(j: Pick<ReachJob, "contract" | "hours">): string[] {
  const base = j.hours === "part_time" ? "PART_TIME" : "FULL_TIME";
  switch (j.contract) {
    case "fixed_term": return [base, "TEMPORARY"];
    case "internship": return ["INTERN"];
    case "freelance": return ["CONTRACTOR"];
    case "apprenticeship": return [base, "OTHER"];
    default: return [base];
  }
}

const unit = { year: "YEAR", month: "MONTH", hour: "HOUR" } as const;

// The last moment of the last day to apply (validThrough).
const endOf = (day: string) => `${day}T23:59:59`;

// jobPosting: the JSON-LD of a job's page (schema.org JobPosting).
export function jobPosting(j: ReachJob, company: Company, url: string): Record<string, unknown> {
  const address = { "@type": "PostalAddress", ...(j.street ? { streetAddress: j.street } : {}), ...(j.place ? { addressLocality: j.place } : {}), ...(j.postalCode ? { postalCode: j.postalCode } : {}), addressCountry: j.country };
  const salary = j.salary && (j.salary.min !== null || j.salary.max !== null)
    ? {
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: j.salary.currency,
        value: {
          "@type": "QuantitativeValue",
          ...(j.salary.min !== null && j.salary.max !== null && j.salary.min !== j.salary.max
            ? { minValue: j.salary.min, maxValue: j.salary.max }
            : { value: j.salary.min ?? j.salary.max }),
          unitText: unit[j.salary.period],
        },
      },
    }
    : {};
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: j.title,
    description: descriptionHtml(j.description),
    datePosted: (j.openedAt ?? j.updatedAt).slice(0, 10),
    ...(j.closesOn ? { validThrough: endOf(j.closesOn) } : {}),
    employmentType: employmentTypes(j),
    hiringOrganization: {
      "@type": "Organization",
      name: company.name,
      ...(company.website ? { sameAs: company.website } : {}),
      ...(company.logo ? { logo: company.logo } : {}),
    },
    // A remote job still says where the company is (Google accepts both);
    // a fully remote one says who may apply: the job's country.
    jobLocation: { "@type": "Place", address },
    ...(j.remote === "remote" ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: j.country } } : {}),
    ...salary,
    identifier: { "@type": "PropertyValue", name: company.name, value: j.id },
    directApply: true,
    url,
    inLanguage: j.language,
  };
}

// The JSON-LD as the page's script carries it: "<" escaped, so no text of
// a job can close the script element.
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/&/gu, "\\u0026").replace(/\u2028/gu, "\\u2028").replace(/\u2029/gu, "\\u2029");
}

// XML text: the five characters escaped, characters XML refuses removed.
export const xmlText = (text: string) => text.replace(/[^\x09\x0a\x0d\x20-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
// CDATA: "]]>" split across two sections, so it can never end one early.
export const cdata = (text: string) => `<![CDATA[${text.replace(/[^\x09\x0a\x0d\x20-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, "").replace(/\]\]>/gu, "]]]]><![CDATA[>")}]]>`;

// RFC 822 dates, as RSS and Indeed write them.
export const rfc822 = (iso: string) => new Date(iso).toUTCString();

// Indeed's job types.
const indeedType = (j: ReachJob) => {
  if (j.contract === "internship") return "internship";
  if (j.contract === "freelance") return "contract";
  if (j.contract === "fixed_term") return j.hours === "part_time" ? "parttime, temporary" : "fulltime, temporary";
  return j.hours === "part_time" ? "parttime" : "fulltime";
};

// indeedFeed: the open jobs in Indeed's XML format. salaryWords writes a
// job's salary as the careers page does, in the job's language.
export function indeedFeed(jobs: ReachJob[], company: Company, origin: string, salaryWords: (j: ReachJob) => string, now = new Date()): string {
  const job = (j: ReachJob) => [
    "  <job>",
    `    <title>${cdata(j.title)}</title>`,
    `    <date>${cdata(rfc822(j.openedAt ?? j.updatedAt))}</date>`,
    `    <referencenumber>${cdata(j.id)}</referencenumber>`,
    `    <url>${cdata(`${origin}/${j.slug}`)}</url>`,
    `    <company>${cdata(company.name)}</company>`,
    `    <sourcename>${cdata(company.name)}</sourcename>`,
    `    <city>${cdata(j.place)}</city>`,
    "    <state><![CDATA[]]></state>",
    `    <country>${cdata(j.country)}</country>`,
    `    <postalcode>${cdata(j.postalCode)}</postalcode>`,
    `    <streetaddress>${cdata(j.street)}</streetaddress>`,
    `    <description>${cdata(descriptionHtml(j.description))}</description>`,
    `    <salary>${cdata(salaryWords(j))}</salary>`,
    `    <jobtype>${cdata(indeedType(j))}</jobtype>`,
    ...(j.remote === "remote" ? ["    <remotetype><![CDATA[Fully remote]]></remotetype>"] : j.remote === "hybrid" ? ["    <remotetype><![CDATA[Hybrid remote]]></remotetype>"] : []),
    ...(j.closesOn ? [`    <expirationdate>${cdata(rfc822(endOf(j.closesOn) + "Z"))}</expirationdate>`] : []),
    "  </job>",
  ].join("\n");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<source>",
    `  <publisher>${xmlText(company.name)}</publisher>`,
    `  <publisherurl>${xmlText(origin + "/")}</publisherurl>`,
    `  <lastBuildDate>${xmlText(rfc822(now.toISOString()))}</lastBuildDate>`,
    ...jobs.map(job),
    "</source>",
    "",
  ].join("\n");
}

// rssFeed: the open jobs as RSS 2.0, for aggregators and feed readers.
export function rssFeed(jobs: ReachJob[], channel: { title: string; description: string; language: string }, origin: string, facts: (j: ReachJob) => string, now = new Date()): string {
  const item = (j: ReachJob) => [
    "    <item>",
    `      <title>${xmlText(j.title)}</title>`,
    `      <link>${xmlText(`${origin}/${j.slug}`)}</link>`,
    `      <guid isPermaLink="true">${xmlText(`${origin}/${j.slug}`)}</guid>`,
    `      <pubDate>${xmlText(rfc822(j.openedAt ?? j.updatedAt))}</pubDate>`,
    ...(j.team ? [`      <category>${xmlText(j.team)}</category>`] : []),
    `      <description>${xmlText([facts(j), plain(j.description, 600)].filter(Boolean).join(" — "))}</description>`,
    "    </item>",
  ].join("\n");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xmlText(channel.title)}</title>`,
    `    <link>${xmlText(origin + "/")}</link>`,
    `    <description>${xmlText(channel.description)}</description>`,
    `    <language>${xmlText(channel.language)}</language>`,
    `    <lastBuildDate>${xmlText(rfc822(now.toISOString()))}</lastBuildDate>`,
    `    <atom:link href="${xmlText(origin + "/feed.xml")}" rel="self" type="application/rss+xml"/>`,
    ...jobs.map(item),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

// sitemap: the careers page and every open job, with their last change.
export function sitemap(jobs: ReachJob[], origin: string): string {
  const url = (loc: string, lastmod?: string) => `  <url><loc>${xmlText(loc)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}</url>`;
  const newest = jobs.map(j => j.updatedAt).sort().at(-1);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    url(origin + "/", newest),
    ...jobs.map(j => url(`${origin}/${j.slug}`, j.updatedAt)),
    "</urlset>",
    "",
  ].join("\n");
}

// Share links: the job's address in a LinkedIn or X post the recruiter
// finishes there (the tool calls neither: the browser opens their page).
export function shareLinks(url: string, text: string): { linkedin: string; x: string; email: string } {
  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    x: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`,
  };
}
