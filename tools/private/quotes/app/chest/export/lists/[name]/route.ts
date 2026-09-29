import * as chest from "@argentic/chest-sdk/chest";
import { db } from "../../../../../lib/db.ts";
import { clientsCsv, itemsCsv } from "../../../../../lib/export.ts";
import { attachment, asker, failure, refuse } from "../../../../../lib/http.ts";
import { catalogue } from "../../../../../lib/i18n/index.ts";

// The clients or the catalogue as a spreadsheet (/chest/export/lists/clients,
// /chest/export/lists/items), with the importer's column names.
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  const { name } = await params;
  if (name !== "clients" && name !== "items") return refuse("not_found", 404);
  try {
    const text = name === "clients" ? await clientsCsv(db(), who.actor, who.locale) : await itemsCsv(db(), who.actor, who.locale, chest.currency());
    const t = catalogue(who.locale).csv;
    return new Response(text, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment((name === "clients" ? t.clientsFile : t.itemsFile) + ".csv"), "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
