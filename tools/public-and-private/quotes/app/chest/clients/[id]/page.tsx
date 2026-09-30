import { chest } from "@argentic/chest-sdk/chest";
import { notFound } from "next/navigation";
import { can } from "../../../../lib/access.ts";
import { getClient } from "../../../../lib/clients.ts";
import { db } from "../../../../lib/db.ts";
import { listDocuments } from "../../../../lib/documents.ts";
import { AppError } from "../../../../lib/errors.ts";
import { rowView } from "../../../../lib/rows.ts";
import { viewer } from "../../../../lib/session.ts";
import { ClientView } from "./client-view.tsx";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  const client = await getClient(sql, member, id).catch(error => {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  });
  const docs = await listDocuments(sql, member, { types: ["quote", "invoice", "credit"], clientId: client.id }, chest.today());
  return (
    <ClientView t={t} client={client} rows={docs.map(r => rowView(r, t, locale))} canWrite={can(member, "clients.write")} canQuote={can(member, "quotes.write")} canInvoice={can(member, "invoices.draft")} />
  );
}
