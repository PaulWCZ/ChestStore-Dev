import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { getClient } from "../lib/clients.ts";
import { db } from "../lib/db.ts";
import { listDocuments } from "../lib/documents.ts";
import { rowView } from "../lib/rows.ts";

// One client: their card, and everything written for them (an island).
export async function clientPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const locale = localeOf(ctx.locale);
  const sql = db();
  const client = await getClient(sql, member, ctx.param("id"));
  const docs = await listDocuments(sql, member, { types: ["quote", "invoice", "credit"], clientId: client.id }, chest.today());
  return {
    title: client.name,
    body: <Island id={`client-${client.id}`} name="ClientView" props={{
      t: { clients: t.clients, list: t.list, kit: t.kit, clientForm: t.clientForm, errors: t.errors, common: t.common, shell: t.shell, desk: t.desk },
      client, rows: docs.map(r => rowView(r, t, locale)), canWrite: can(member, "clients.write"), canQuote: can(member, "quotes.write"), canInvoice: can(member, "invoices.draft"),
    }} />,
  };
}
