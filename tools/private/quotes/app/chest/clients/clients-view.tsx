"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientForm, blankClient } from "../../../components/client-form.tsx";
import { Dialog } from "../../../components/dialog.tsx";
import { People, Plus, Search } from "../../../components/icons.tsx";
import type { Client } from "../../../lib/clients.ts";
import { plural } from "../../../lib/i18n/format.ts";
import type { Catalogue, Locale } from "../../../lib/i18n/index.ts";

// The clients: a searchable list, a new one in a dialog. A client is opened
// to change their card and see their documents.
export function ClientsView({ t, locale, clients, archived, q, total, canWrite, defaultLanguage }: { t: Catalogue; locale: Locale; clients: Client[]; archived: boolean; q: string; total: number; canWrite: boolean; defaultLanguage: Locale }) {
  const c = t.clients;
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
        {canWrite && <div className="actions"><button type="button" className="button" onClick={() => setAdding(true)}><Plus />{c.add}</button></div>}
      </div>
      {total === 0 && !archived ? (
        <div className="empty">
          <People />
          <h2>{c.empty.title}</h2>
          <p>{c.empty.body}</p>
          {canWrite && <div className="actions"><button type="button" className="button" onClick={() => setAdding(true)}><Plus />{c.add}</button></div>}
        </div>
      ) : (
        <>
          <div className="toolbar">
            <nav className="filters" aria-label={t.list.filters}>
              <a href="/chest/clients" aria-current={!archived ? "true" : undefined}>{c.active}</a>
              <a href="/chest/clients?archived=1" aria-current={archived ? "true" : undefined}>{c.archived}</a>
            </nav>
            <form className="search" role="search" action="/chest/clients">
              {archived && <input type="hidden" name="archived" value="1" />}
              <Search />
              <label className="visually-hidden" htmlFor="q">{t.list.search}</label>
              <input id="q" className="field" type="search" name="q" defaultValue={q} placeholder={c.search} />
            </form>
          </div>
          {clients.length === 0 ? <p className="muted">{t.list.none}</p> : (
            <div className="ledger">
              <ul className="plain">
                {clients.map(x => (
                  <li key={x.id} className="ledger-row clients-row">
                    <a className="main" href={`/chest/clients/${x.id}`}><span className="visually-hidden">{x.name}</span></a>
                    <span className="who" aria-hidden="true">{x.name}</span>
                    <span className="what" aria-hidden="true">{[x.contact, x.email].filter(Boolean).join(" · ")}</span>
                    <span className="date" aria-hidden="true">{[x.postcode, x.city].filter(Boolean).join(" ")}</span>
                    <span className="amount" aria-hidden="true">{plural(c.documents, x.documents, locale)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <Dialog open={adding} title={c.add} closeLabel={t.shell.close} onClose={() => setAdding(false)}>
        <ClientForm t={t} initial={blankClient(defaultLanguage)} onCancel={() => setAdding(false)} onSaved={saved => { setAdding(false); router.push(`/chest/clients/${saved.id}`); }} />
      </Dialog>
    </main>
  );
}
