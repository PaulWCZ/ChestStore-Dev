import { call, toast, navigate } from "@argentic/chest-app/client";
import { useStep } from "../components/step.ts";
import { StatusBadge } from "@argentic/chest-ui/components";
import { useState } from "react";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";

// An example project (a client, three tasks), opened at once.
export function ExampleButton({ label }: { label: string }) {
  const [pending, start] = useStep();
  return (
    <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => {
      const r = await call("addExample", {}, { refresh: false });
      if (r.ok) await navigate(`/chest/projects/${r.value.id}`);
    })}>{label}</button>
  );
}

type ClientRow = { id: string; name: string; archived: boolean; count: string };

// The clients: rename one, hide one from new projects (and show it again).
export function ClientsView({ clients, t }: { clients: ClientRow[]; t: { projects: Catalogue["projects"]; errors: Catalogue["errors"] } }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pending, start] = useStep();

  function hide(c: ClientRow, archived: boolean) {
    start(async () => {
      const r = await call("archiveClient", { id: c.id, archived });
      if (!r.ok) return;
      if (archived) {
        toast({
          id: `client-${c.id}`,
          text: t.projects.clientArchived,
          undo: async () => {
            const u = await call("archiveClient", { id: c.id, archived: false }, { quiet: true });
            return u.ok || u.message;
          },
        });
      }
    });
  }

  return (
    <ul className="client-list">
      {clients.map(c => (
        <li key={c.id} id={`client-row-${c.id}`} className={c.archived ? "hidden-client" : ""}>
          {editing === c.id ? (
            <form className="inline-form" onSubmit={e => {
              e.preventDefault();
              start(async () => {
                const r = await call("renameClient", { id: c.id, name });
                if (!r.ok) return;
                setEditing(null);
                toast({ id: `client-${c.id}`, text: t.projects.clientSaved });
              });
            }}>
              <label className="visually-hidden" htmlFor={`client-${c.id}`}>{format(t.projects.renameClientLabel, { name: c.name })}</label>
              <input id={`client-${c.id}`} className="field" value={name} maxLength={80} autoFocus onChange={e => setName(e.target.value)} />
              <button type="submit" className="button" disabled={pending}>{t.projects.renameClient}</button>
              <button type="button" className="button link" onClick={() => setEditing(null)}>{t.projects.cancel}</button>
            </form>
          ) : (
            <>
              <span className="client-name">{c.name}{c.archived && <StatusBadge tone="neutral" size="s" label={t.projects.hiddenClient} />}</span>
              <span className="muted small">{c.count}</span>
              <span className="client-actions">
                <button type="button" className="button link small" onClick={() => { setEditing(c.id); setName(c.name); }}>{t.projects.renameClient}</button>
                <button type="button" className="button link small" disabled={pending} onClick={() => hide(c, !c.archived)}>{c.archived ? t.projects.unarchiveClient : t.projects.archiveClient}</button>
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
