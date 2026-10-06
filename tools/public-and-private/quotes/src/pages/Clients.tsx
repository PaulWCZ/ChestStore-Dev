import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { Pager, pageOf, pageSize } from "../components/pager.tsx";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { countClients, countMatching, listClients } from "../lib/clients.ts";
import { db } from "../lib/db.ts";

// The clients: a searchable list, a page at a time (the island takes one
// page, each client's columns only), a new one in a dialog (an island).
export async function clientsPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const archived = ctx.query("archived") === "1";
  const q = (ctx.query("q") ?? "").slice(0, 80);
  const sql = db();
  const locale = localeOf(ctx.locale);
  const matching = await countMatching(sql, { archived, q });
  const { page, pages, offset } = pageOf(ctx.query("page"), matching);
  const list = await listClients(sql, member, { archived, q, limit: pageSize, offset });
  const total = archived || q ? await countClients(sql) : matching;
  const params: Record<string, string> = { ...(archived ? { archived: "1" } : {}), ...(q ? { q } : {}) };
  return {
    title: t.clients.title,
    body: (
      <>
        <Island name="ClientsView" props={{
          t: { clients: t.clients, list: t.list, kit: t.kit, clientForm: t.clientForm, errors: t.errors, common: t.common },
          locale, archived, q, total, canWrite: can(member, "clients.write"), defaultLanguage: localeOf(chest.language),
          clients: list.map(c => ({ id: c.id, name: c.name, contact: c.contact, email: c.email, postcode: c.postcode, city: c.city, documents: c.documents })),
        }} />
        {pages > 1 && <div className="page pager-page">
          <Pager path="/chest/clients" params={params} page={page} pages={pages} shown={list.length} count={matching} words={t.list} locale={locale} back={t.list.previous} next={t.list.next} />
        </div>}
      </>
    ),
  };
}
