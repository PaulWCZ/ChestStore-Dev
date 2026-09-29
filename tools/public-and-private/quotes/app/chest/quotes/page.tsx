import * as chest from "@argentic/chest-sdk/chest";
import { ListPage, type Filter } from "../../../components/list-page.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { listDocuments } from "../../../lib/documents.ts";
import { viewer } from "../../../lib/session.ts";

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const q = typeof params["q"] === "string" ? params["q"].slice(0, 80) : "";
  const rows = await listDocuments(db(), member, { types: ["quote"], q }, chest.today());
  const f = t.quotes.filters;
  const filters: Filter[] = [
    { key: "all", label: f.all, match: () => true },
    { key: "draft", label: f.draft, match: r => r.state === "draft" },
    { key: "sent", label: f.sent, match: r => r.state === "sent" },
    { key: "accepted", label: f.accepted, match: r => r.state === "accepted" },
    { key: "refused", label: f.refused, match: r => r.state === "refused" },
    { key: "expired", label: f.expired, match: r => r.state === "expired" },
  ];
  return (
    <ListPage t={t} locale={locale} path="/chest/quotes" title={t.quotes.title} intro={t.quotes.intro} filters={filters} current={typeof params["state"] === "string" ? params["state"] : "all"} q={q} rows={rows}
      create={can(member, "quotes.write") ? { type: "quote", label: t.quotes.new } : null} empty={t.quotes.empty} readerEmpty={t.quotes.readerEmpty} />
  );
}
