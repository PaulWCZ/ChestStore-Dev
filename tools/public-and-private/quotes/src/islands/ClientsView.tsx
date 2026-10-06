import { navigate } from "@argentic/chest-app/client";
import { DataTable, Dialog, EmptyState, PageHeader, SearchBox, Tabs } from "@argentic/chest-ui/components";
import { useState } from "react";
import { ClientForm, blankClient } from "../components/client-form.tsx";
import { People, Plus, Upload } from "../components/icons.tsx";
import type { Catalogue, Locale } from "../i18n/index.ts";
import { plural } from "../i18n/format.ts";
import type { Client } from "../lib/clients.ts";

export type ClientsWords = Pick<Catalogue, "clients" | "list" | "kit" | "clientForm" | "errors" | "common">;

// The clients: a searchable list (the kit's table), a new one in a dialog
// that asks before losing what was typed. A client is opened to change
// their card and see their documents.
export function ClientsView({ t, locale, clients, archived, q, total, canWrite, defaultLanguage }: { t: ClientsWords; locale: Locale; clients: readonly Client[]; archived: boolean; q: string; total: number; canWrite: boolean; defaultLanguage: Locale }) {
  const c = t.clients;
  const [adding, setAdding] = useState(false);
  const [dirty, setDirty] = useState(false);
  const close = () => { setAdding(false); setDirty(false); };
  const add = <button type="button" className="button" onClick={() => setAdding(true)}><Plus />{c.add}</button>;
  const importLink = <a className="button quiet" href="/chest/import?kind=clients"><Upload />{c.import}</a>;
  return (
    <div className="page">
      <PageHeader size="m" title={c.title} intro={c.intro} secondary={canWrite ? importLink : undefined} action={canWrite ? add : undefined} />
      {total === 0 && !archived ? (
        <EmptyState icon={<People />} title={c.empty.title} body={c.empty.body} action={canWrite ? <>{add}{importLink}</> : undefined} />
      ) : (
        <>
          <div className="toolbar">
            <Tabs label={t.list.filters} current={archived ? "archived" : "active"}
              items={[{ id: "active", label: c.active, href: "/chest/clients" }, { id: "archived", label: c.archived, href: "/chest/clients?archived=1" }]} />
            <SearchBox action="/chest/clients" value={q} keep={{ archived: archived ? "1" : undefined }} labels={{ ...t.kit.search, placeholder: c.search }} maxLength={80} />
          </div>
          {clients.length === 0 ? <p className="muted" role="status">{t.list.none}</p> : (
            <DataTable
              caption={archived ? `${c.title} · ${c.archived}` : c.title}
              rows={clients}
              rowKey={x => x.id}
              labels={t.kit.table}
              columns={[
                { key: "name", label: c.columns.name, rowHeader: true, value: x => x.name, render: x => <a className="doc-link" href={`/chest/clients/${x.id}`}>{x.name}</a> },
                { key: "contact", label: c.columns.contact, hideOnPhone: true, render: x => <span className="what">{[x.contact, x.email].filter(Boolean).join(" · ")}</span> },
                { key: "place", label: c.columns.place, hideOnPhone: true, value: x => x.city, render: x => <span className="date">{[x.postcode, x.city].filter(Boolean).join(" ")}</span> },
                { key: "documents", label: c.columns.documents, align: "end", value: x => x.documents, render: x => <span className="amount">{plural(c.documents, x.documents, locale)}</span> },
              ]}
            />
          )}
        </>
      )}
      <Dialog open={adding} title={c.add} onClose={close} dirty={dirty} labels={t.kit.dialog} size="l">
        {adding && <ClientForm t={t} initial={blankClient(defaultLanguage)} onDirty={setDirty} onCancel={close} onSaved={saved => { close(); void navigate(`/chest/clients/${saved.id}`); }} />}
      </Dialog>
    </div>
  );
}
