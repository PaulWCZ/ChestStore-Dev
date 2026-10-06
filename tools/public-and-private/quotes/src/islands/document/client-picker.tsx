import { Dialog, SearchBox } from "@argentic/chest-ui/components";
import { useState } from "react";
import { useFound } from "./found.ts";
import type { Locale } from "../../i18n/index.ts";
import type { ClientOption } from "../../lib/views.ts";
import type { DocWords } from "../../lib/views.ts";
import { ClientForm, blankClient } from "../../components/client-form.tsx";
import { Plus } from "../../components/icons.tsx";

// Choosing the client of a document: search the clients (on the server, as
// one types: the page carries no list), or add one without
// leaving the paper (a client is a record of the tool, not a person of the
// Chest: this is not the kit's PeoplePicker). The dialog asks before
// losing a half-typed new client.
// A client added here writes in the document's language until changed.
export function ClientPicker({ t, canAdd, language, onPick, onClose }: { t: DocWords; canAdd: boolean; language: Locale; onPick: (c: ClientOption) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [dirty, setDirty] = useState(false);
  const found = useFound<ClientOption>("findClients", q, { language });
  const shown = found.rows ?? [];
  return (
    <Dialog open title={adding ? t.picker.newClient : t.picker.clientTitle} onClose={onClose} labels={t.kit.dialog} dirty={adding && dirty} size={adding ? "l" : "m"}>
      {adding ? (
        <ClientForm t={t} compact initial={{ ...blankClient(language), name: q }} onDirty={setDirty} onCancel={() => { setAdding(false); setDirty(false); }} onSaved={c => onPick({ ...c, countryName: c.country })} />
      ) : (
        <div className="picker">
          <SearchBox action="" id="client-q" value={q} shortcut={false} onSearch={setQ} labels={{ ...t.kit.search, placeholder: t.picker.clientSearch }} maxLength={80} />
          {found.rows === null ? <p className="muted" role="status">{t.picker.searching}</p> : shown.length > 0 ? (
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
          ) : <p className="muted" role="status">{q.trim() === "" ? t.picker.noClients : t.list.none}</p>}
          {canAdd && <button type="button" className="button quiet" onClick={() => setAdding(true)}><Plus />{q ? t.picker.addNamed.replace("{name}", q) : t.picker.newClient}</button>}
        </div>
      )}
    </Dialog>
  );
}
