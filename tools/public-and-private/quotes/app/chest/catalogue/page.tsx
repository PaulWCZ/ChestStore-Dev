import * as chest from "@argentic/chest-sdk/chest";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { listItems } from "../../../lib/items.ts";
import { viewer } from "../../../lib/session.ts";
import { CatalogueView } from "./catalogue-view.tsx";

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const archived = (await searchParams)["archived"] === "1";
  const items = await listItems(db(), member, { archived });
  return <CatalogueView t={t} locale={locale} items={items} archived={archived} canWrite={can(member, "catalogue.write")} currency={chest.currency()} />;
}
