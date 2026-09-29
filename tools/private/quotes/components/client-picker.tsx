"use client";

import { useMemo, useState } from "react";
import type { Catalogue, Locale } from "../lib/i18n/index.ts";
import type { ClientOption } from "../lib/views.ts";
import { ClientForm, blankClient } from "./client-form.tsx";
import { Dialog } from "./dialog.tsx";
import { Plus, Search } from "./icons.tsx";

// Choosing the client of a document: search the list, or add one without
// leaving the paper.
// A client added here writes in the document's language until changed.
export function ClientPicker({ t, clients, canAdd, language, onPick, onClose }: { t: Catalogue; clients: ClientOption[]; canAdd: boolean; language: Locale; onPick: (c: ClientOption) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const shown = useMemo(() => {
    const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase();
    const needle = fold(q.trim());
    return clients.filter(c => !needle || fold([c.name, c.contact, c.city, c.email].join(" ")).includes(needle)).slice(0, 100);
  }, [q, clients]);
  return (
    <Dialog open title={adding ? t.picker.newClient : t.picker.clientTitle} closeLabel={t.shell.close} onClose={onClose}>
      {adding ? (
        <ClientForm t={t} compact initial={{ ...blankClient(language), name: q }} onCancel={() => setAdding(false)} onSaved={c => onPick({ ...c, countryName: c.country })} />
      ) : (
        <div className="picker">
          <div className="search">
            <Search />
            <label className="visually-hidden" htmlFor="client-q">{t.list.search}</label>
            <input id="client-q" className="field" type="search" value={q} placeholder={t.picker.clientSearch} onChange={e => setQ(e.target.value)} autoFocus />
          </div>
          {shown.length > 0 ? (
            <ul>
              {shown.map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => onPick(c)}>
                    <strong>{c.name}</strong>
                    <span className="sub">{[c.contact, c.city].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{clients.length === 0 ? t.picker.noClients : t.list.none}</p>}
          {canAdd && <button type="button" className="button quiet" onClick={() => setAdding(true)}><Plus />{q ? t.picker.addNamed.replace("{name}", q) : t.picker.newClient}</button>}
        </div>
      )}
    </Dialog>
  );
}
