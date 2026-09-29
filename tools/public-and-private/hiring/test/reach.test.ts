import assert from "node:assert/strict";
import { test } from "node:test";
import { cdata, descriptionHtml, employmentTypes, indeedFeed, jobPosting, jsonLd, rssFeed, sitemap, type ReachJob } from "../lib/reach.ts";

// Reach without network: Google for Jobs' JobPosting, Indeed's XML feed,
// RSS, the sitemap (sources in lib/reach.ts).
const job: ReachJob = {
  id: "7", slug: "cabinet-maker", title: "Cabinet maker <senior>", team: "Workshop", place: "Lyon", contract: "fixed_term", remote: "onsite", hours: "full_time",
  description: "## The job\n- Draw **beautiful** chairs\n\nA line with ]]> and </script>", language: "en", openedAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-02T08:00:00.000Z",
  closesOn: "2026-10-31", country: "FR", postalCode: "69003", street: "14 rue des Tanneurs", salary: { min: 42000, max: 50000, currency: "EUR", period: "year" },
};
const company = { name: "Atelier Martin", website: "https://atelier.example/", logo: "https://jobs.atelier.example/_chest/public/brand/logo.png?v=1" };

test("JobPosting has every property Google requires, and the recommended ones we know", () => {
  const p = jobPosting(job, company, "https://jobs.atelier.example/cabinet-maker");
  // Required: title, description, datePosted, hiringOrganization, jobLocation.
  assert.equal(p["@type"], "JobPosting");
  assert.equal(p["title"], "Cabinet maker <senior>");
  assert.equal(p["datePosted"], "2026-09-01");
  assert.deepEqual(p["hiringOrganization"], { "@type": "Organization", name: "Atelier Martin", sameAs: "https://atelier.example/", logo: company.logo });
  assert.deepEqual(p["jobLocation"], { "@type": "Place", address: { "@type": "PostalAddress", streetAddress: "14 rue des Tanneurs", addressLocality: "Lyon", postalCode: "69003", addressCountry: "FR" } });
  assert.match(String(p["description"]), /^<h2>The job<\/h2><ul><li>Draw <strong>beautiful<\/strong> chairs<\/li><\/ul><p>A line with \]\]&gt; and &lt;\/script&gt;<\/p>$/u);
  // Recommended.
  assert.equal(p["validThrough"], "2026-10-31T23:59:59");
  assert.deepEqual(p["employmentType"], ["FULL_TIME", "TEMPORARY"]);
  assert.deepEqual(p["baseSalary"], { "@type": "MonetaryAmount", currency: "EUR", value: { "@type": "QuantitativeValue", minValue: 42000, maxValue: 50000, unitText: "YEAR" } });
  assert.equal(p["directApply"], true);
  // Fully remote: TELECOMMUTE with who may apply.
  const remote = jobPosting({ ...job, remote: "remote" }, company, "https://x.test/");
  assert.equal(remote["jobLocationType"], "TELECOMMUTE");
  assert.deepEqual(remote["applicantLocationRequirements"], { "@type": "Country", name: "FR" });
  // The script never closes early.
  const text = jsonLd(p);
  assert.ok(!text.includes("<") && !text.includes(">"));
  assert.deepEqual(JSON.parse(text), p);
});

test("employment types for each contract", () => {
  assert.deepEqual(employmentTypes({ contract: "permanent", hours: "part_time" }), ["PART_TIME"]);
  assert.deepEqual(employmentTypes({ contract: "internship", hours: "full_time" }), ["INTERN"]);
  assert.deepEqual(employmentTypes({ contract: "freelance", hours: "full_time" }), ["CONTRACTOR"]);
});

test("Indeed's feed: the source, its publisher, one job each with the elements Indeed reads", () => {
  const xml = indeedFeed([job], company, "https://jobs.atelier.example", () => "€42,000 – €50,000 per year", new Date("2026-09-29T10:00:00Z"));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<source>'));
  for (const tag of ["publisher", "publisherurl", "lastBuildDate", "job", "title", "date", "referencenumber", "url", "company", "city", "state", "country", "postalcode", "description", "salary", "jobtype"]) assert.ok(xml.includes(`<${tag}>`), tag);
  assert.ok(xml.includes("<referencenumber><![CDATA[7]]></referencenumber>"));
  assert.ok(xml.includes("<date><![CDATA[Tue, 01 Sep 2026 08:00:00 GMT]]></date>"));
  assert.ok(xml.includes("<jobtype><![CDATA[fulltime, temporary]]></jobtype>"));
  // "]]>" in a description never ends its CDATA.
  assert.equal(cdata("a]]>b"), "<![CDATA[a]]]]><![CDATA[>b]]>");
  assert.equal((xml.match(/<job>/gu) ?? []).length, 1);
});

test("RSS 2.0 and the sitemap", () => {
  const rss = rssFeed([job], { title: "Join Atelier & Martin", description: "Chairs", language: "en" }, "https://jobs.atelier.example", () => "Workshop · Lyon");
  assert.ok(rss.includes("<title>Join Atelier &amp; Martin</title>"));
  assert.ok(rss.includes("<guid isPermaLink=\"true\">https://jobs.atelier.example/cabinet-maker</guid>"));
  assert.ok(rss.includes("<title>Cabinet maker &lt;senior&gt;</title>"));
  const map = sitemap([job], "https://jobs.atelier.example");
  assert.ok(map.includes("<url><loc>https://jobs.atelier.example/cabinet-maker</loc><lastmod>2026-09-02</lastmod></url>"));
  assert.ok(descriptionHtml("**<b>**").includes("<strong>&lt;b&gt;</strong>"));
});
