import * as chest from "@argentic/chest-sdk/chest";
import { ListPage, type Filter } from "../../../components/list-page.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { listDocuments } from "../../../lib/documents.ts";
import { viewer } from "../../../lib/session.ts";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const q = typeof params["q"] === "string" ? params["q"].slice(0, 80) : "";
  const rows = await listDocuments(db(), member, { types: ["invoice", "credit"], q }, chest.today());
  const f = t.invoices.filters;
  const open = new Set(["unpaid", "partly_paid", "overdue"]);
  const filters: Filter[] = [
    { key: "all", label: f.all, match: () => true },
    { key: "draft", label: f.draft, match: r => r.status === "draft" },
    { key: "open", label: f.open, match: r => r.type === "invoice" && open.has(r.state) },
    { key: "overdue", label: f.overdue, match: r => r.state === "overdue" },
    { key: "paid", label: f.paid, match: r => r.state === "paid" },
    { key: "credit", label: f.credit, match: r => r.type === "credit" },
  ];
  return (
    <ListPage t={t} locale={locale} path="/chest/invoices" title={t.invoices.title} intro={t.invoices.intro} filters={filters} current={typeof params["state"] === "string" ? params["state"] : "all"} q={q} rows={rows}
      create={can(member, "invoices.draft") ? { type: "invoice", label: t.invoices.new } : null} empty={t.invoices.empty} />
  );
}
