import { chest } from "@argentic/chest-sdk/chest";
import { can } from "../../../lib/access.ts";
import { listClients } from "../../../lib/clients.ts";
import { db } from "../../../lib/db.ts";
import { isLocale } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";
import { ClientsView } from "./clients-view.tsx";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const archived = params["archived"] === "1";
  const q = typeof params["q"] === "string" ? params["q"].slice(0, 80) : "";
  const list = await listClients(db(), member, { archived, q });
  const all = archived || q ? await listClients(db(), member) : list;
  const language = chest.language;
  return (
    <ClientsView t={t} locale={locale} clients={list} archived={archived} q={q} total={all.length} canWrite={can(member, "clients.write")} defaultLanguage={isLocale(language) ? language : "en"} />
  );
}
