"use client";

import { StatusBadge, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format } from "../../../lib/i18n/format.ts";
import { addExample, archiveClient, renameClient } from "../actions.ts";

export function ExampleButton({ label, errors }: { label: string; errors: Catalogue["errors"] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => {
      const r = await addExample();
      if (!r.ok) return void toast({ text: format(errors[r.error], r.values), tone: "error" });
      router.push(`/chest/projects/${r.value.id}`);
    })}>{label}</button>
  );
}

type ClientRow = { id: string; name: string; archived: boolean; count: string };

// The clients: rename one, hide one from new projects (and show it again).
export function ClientsView({ clients, t }: { clients: ClientRow[]; t: { projects: Catalogue["projects"]; errors: Catalogue["errors"] } }) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const fail = (code: keyof Catalogue["errors"], values?: Record<string, string | number>) => void toast({ text: format(t.errors[code], values), tone: "error" });

  function hide(c: ClientRow, archived: boolean) {
    start(async () => {
      const r = await archiveClient(c.id, archived);
      if (!r.ok) return fail(r.error, r.values);
      if (archived) {
        toast({
          id: `client-${c.id}`,
          text: t.projects.clientArchived,
          undo: async () => {
            const u = await archiveClient(c.id, false);
            if (!u.ok) return format(t.errors[u.error], u.values);
            router.refresh();
            return true;
          },
        });
      }
    });
  }

  return (
    <ul className="client-list">
      {clients.map(c => (
        <li key={c.id} className={c.archived ? "hidden-client" : ""}>
          {editing === c.id ? (
            <form className="inline-form" onSubmit={e => {
              e.preventDefault();
              start(async () => {
                const r = await renameClient(c.id, name);
                if (!r.ok) return fail(r.error, r.values);
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
