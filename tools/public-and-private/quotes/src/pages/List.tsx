import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { EmptyState, Filters, PageHeader } from "@argentic/chest-ui/components";
import { BlankSheet } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { listDocuments, type ListRow } from "../lib/documents.ts";
import { formatMoney } from "../lib/money.ts";
import { rowView } from "../lib/rows.ts";
import { localeOf } from "../i18n/index.ts";

// A list of quotes or of invoices: its filters (the states, as links that
// keep the search: the kit's Filters), a search box that works without
// script ("/" reaches it), the ledger (the kit's DataTable) with the total
// of what is shown.
type Filter = { key: string; label: string; match: (r: ListRow) => boolean };

export async function quotesPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const q = (ctx.query("q") ?? "").slice(0, 80);
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
  return {
    title: t.quotes.title,
    body: listPage(ctx, {
      path: "/chest/quotes", title: t.quotes.title, intro: t.quotes.intro, filters, rows, q,
      create: can(member, "quotes.write") ? { type: "quote", label: t.quotes.new } : null, empty: t.quotes.empty, readerEmpty: t.quotes.readerEmpty,
    }),
  };
}

export async function invoicesPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const q = (ctx.query("q") ?? "").slice(0, 80);
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
  return {
    title: t.invoices.title,
    body: listPage(ctx, {
      path: "/chest/invoices", title: t.invoices.title, intro: t.invoices.intro, filters, rows, q,
      create: can(member, "invoices.draft") ? { type: "invoice", label: t.invoices.new } : null, empty: t.invoices.empty, readerEmpty: t.invoices.readerEmpty,
      more: can(member, "invoices.issue") ? { href: "/chest/import?kind=invoices", label: t.invoices.importOpen } : null,
      side: can(member, "payments") && rows.some(r => r.type === "invoice" && open.has(r.state)) ? { href: "/chest/bank", label: t.shell.bank } : null,
    }),
  };
}

function listPage(ctx: PageContext<MemberContext>, { path, title, intro, filters, rows, q, create, empty, more, side, readerEmpty }: {
  path: string;
  title: string;
  intro: string;
  // The first one is "all" (no filter).
  filters: Filter[];
  rows: ListRow[];
  q: string;
  create: { type: "quote" | "invoice"; label: string } | null;
  empty: Catalogue["quotes"]["empty"];
  // A quieter second way in, while the list is empty (import the invoices
  // still to collect: switching day's; afterwards it waits in "More").
  more?: { href: string; label: string } | null;
  // The header's quieter action once the list has something (match a bank
  // statement).
  side?: { href: string; label: string } | null;
  // What an empty list says to someone who cannot write here (a viewer).
  readerEmpty: string;
}) {
  const { t } = ctx;
  const locale = localeOf(ctx.locale);
  const [all, ...states] = filters;
  const current = ctx.query("state") ?? "all";
  const active = states.find(f => f.key === current) ?? all!;
  const shown = rows.filter(active.match);
  const currencies = new Set(shown.map(r => r.currency));
  const totalValue = shown.reduce((s, r) => s + (r.type === "credit" ? -r.gross : r.gross), 0);
  const params: Record<string, string> = { ...(active !== all ? { state: active.key } : {}), ...(q ? { q } : {}) };
  const h = t.list.head;
  const newButton = (label: string) => create && <Island name="NewDocument" props={{ type: create.type, label }} />;
  return (
    <div className="page">
      {/* Empty, the page's one action is the empty state's: no header button. */}
      <PageHeader size="m" title={title} intro={intro}
        secondary={side && (rows.length > 0 || q) ? <a className="button quiet" href={side.href}>{side.label}</a> : undefined}
        action={create && (rows.length > 0 || q) ? newButton(create.label) : undefined} />
      {rows.length === 0 && !q ? (
        <EmptyState icon={<BlankSheet />} title={empty.title} body={create ? empty.body : readerEmpty}
          action={create ? (
            <>
              {newButton(empty.action)}
              {more && <a className="button quiet" href={more.href}>{more.label}</a>}
            </>
          ) : more ? <a className="button quiet" href={more.href}>{more.label}</a> : undefined} />
      ) : (
        <>
          <div className="toolbar">
            <Filters path={path} params={params} labels={t.kit.filters}
              groups={[{ key: "state", label: t.list.filters, all: true, options: states.map(f => ({ value: f.key, label: f.label, count: rows.filter(f.match).length })) }]} />
            <Island name="SearchField" props={{ action: path, value: q, keep: active !== all ? { state: active.key } : {}, labels: t.kit.search }} />
          </div>
          {shown.length === 0 ? (
            <p className="muted" role="status">{t.list.none}</p>
          ) : (
            <Island name="DocTable" props={{
              rows: shown.map(r => rowView(r, t, locale)),
              words: { caption: title, number: h.number, client: h.client, what: h.what, date: h.date, amount: h.amount, state: h.state, total: t.list.total },
              labels: t.kit.table,
              total: currencies.size === 1 && shown.length > 1 ? formatMoney(totalValue, [...currencies][0]!, locale) : null,
            }} />
          )}
        </>
      )}
    </div>
  );
}
