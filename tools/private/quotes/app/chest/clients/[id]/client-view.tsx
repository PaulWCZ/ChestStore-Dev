"use client";

import { useRouter } from "next/navigation";
import { ClientForm } from "../../../../components/client-form.tsx";
import { Back, Plus } from "../../../../components/icons.tsx";
import { Ledger } from "../../../../components/ledger.tsx";
import { NewDocument } from "../../../../components/new-document.tsx";
import { useToast } from "../../../../components/toast.tsx";
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
    if (!result.ok) return toast(t.errors[result.error]);
    if (archived) toast(c.archivedToast, { label: t.common.undo, run: () => void archiveClient(client.id, false).then(() => router.refresh()) });
    else toast(c.restored);
    router.refresh();
  }
  return (
    <main className="page">
      <a className="back" href="/chest/clients"><Back />{t.shell.clients}</a>
      <div className="page-head">
        <div>
          <h1>{client.name}</h1>
          <p>{client.archived ? c.isArchived : [client.city, client.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="actions">
          {canInvoice && !client.archived && <NewDocument type="invoice" clientId={client.id} className="button quiet" errors={t.errors}><Plus />{t.desk.newInvoice}</NewDocument>}
          {canQuote && !client.archived && <NewDocument type="quote" clientId={client.id} errors={t.errors}><Plus />{t.desk.newQuote}</NewDocument>}
        </div>
      </div>
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
          {rows.length === 0 ? <p className="muted">{c.noDocuments}</p> : <Ledger rows={rows} head={t.list.head} />}
        </section>
      </div>
    </main>
  );
}
