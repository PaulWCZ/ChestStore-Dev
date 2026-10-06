import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { countClients, listClients } from "../lib/clients.ts";
import { db } from "../lib/db.ts";

// The clients: a searchable list, a new one in a dialog (an island).
export async function clientsPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const archived = ctx.query("archived") === "1";
  const q = (ctx.query("q") ?? "").slice(0, 80);
  const sql = db();
  const list = await listClients(sql, member, { archived, q });
  const total = archived || q ? await countClients(sql) : list.length;
  return {
    title: t.clients.title,
    body: <Island name="ClientsView" props={{
      t: { clients: t.clients, list: t.list, kit: t.kit, clientForm: t.clientForm, errors: t.errors, common: t.common },
      locale: localeOf(ctx.locale), clients: list, archived, q, total, canWrite: can(member, "clients.write"), defaultLanguage: localeOf(chest.language),
    }} />,
  };
}
