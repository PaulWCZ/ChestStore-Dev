"use client";

import { PageHeader, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { ClientForm } from "../../../../components/client-form.tsx";
import { DocTable } from "../../../../components/doc-table.tsx";
import { Back, Plus } from "../../../../components/icons.tsx";
import { NewDocument } from "../../../../components/new-document.tsx";
import type { Client } from "../../../../lib/clients.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import type { RowView } from "../../../../lib/rows.ts";
import { archiveClient } from "../../actions.ts";

// One client: their card, and everything written for them.
export function ClientView({ t, client, rows, canWrite, canQuote, canInvoice }: { t: Catalogue; client: Client; rows: RowView[]; canWrite: boolean; canQuote: boolean; canInvoice: boolean }) {
  const c = t.clients;
  const router = useRouter();
  const toast = useToast();
  async function archive(archived: boolean) {
    const result = await archiveClient(client.id, archived);
    if (!result.ok) return toast({ text: t.errors[result.error], tone: "error" });
    if (archived) toast({ id: `archive-${client.id}`, text: c.archivedToast, undo: async () => { const back = await archiveClient(client.id, false); router.refresh(); return back.ok || t.errors[back.error]; } });
    else toast({ id: `archive-${client.id}`, text: c.restored });
    router.refresh();
  }
  return (
    <div className="page">
      <a className="back" href="/chest/clients"><Back />{t.shell.clients}</a>
      <PageHeader
        size="m"
        title={client.name}
        intro={client.archived ? c.isArchived : [client.city, client.email].filter(Boolean).join(" · ")}
        secondary={canInvoice && !client.archived ? <NewDocument type="invoice" clientId={client.id} className="button quiet" errors={t.errors}><Plus />{t.desk.newInvoice}</NewDocument> : undefined}
        action={canQuote && !client.archived ? <NewDocument type="quote" clientId={client.id} errors={t.errors}><Plus />{t.desk.newQuote}</NewDocument> : undefined}
      />
      <div className="stack">
        <section className="panel" aria-labelledby="card">
          <h2 id="card">{c.card}</h2>
          <p className="hint">{c.cardHint}</p>
          <ClientForm t={t} id={client.id} readOnly={!canWrite} initial={{
            kind: client.kind, name: client.name, contact: client.contact, email: client.email, phone: client.phone, address: client.address, postcode: client.postcode, city: client.city,
            country: client.country, deliveryAddress: client.deliveryAddress, siren: client.siren, vatNumber: client.vatNumber, language: client.language, reverseCharge: client.reverseCharge, notes: client.notes, account: client.account,
          }} onSaved={() => router.refresh()} />
          {canWrite && (
            <p className="hint archive-line">
              {client.archived
                ? <button type="button" className="link-button" onClick={() => void archive(false)}>{c.restore}</button>
                : <button type="button" className="link-button danger" onClick={() => void archive(true)}>{c.archive}</button>}
              {" "}{c.archiveHint}
            </p>
          )}
        </section>
        <section aria-labelledby="docs">
          <h2 id="docs" className="section-title">{c.documentsTitle}</h2>
          {rows.length === 0 ? <p className="muted">{c.noDocuments}</p> : (
            <DocTable rows={rows} labels={t.table}
              words={{ caption: c.documentsTitle, number: t.list.head.number, client: t.list.head.client, what: t.list.head.what, date: t.list.head.date, amount: t.list.head.amount, state: t.list.head.state, total: t.list.total }} />
          )}
        </section>
      </div>
    </div>
  );
}
