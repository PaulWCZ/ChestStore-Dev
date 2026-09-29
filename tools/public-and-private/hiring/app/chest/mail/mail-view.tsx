"use client";

import { useState, useTransition } from "react";
import { Bin, Download } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { fileMessage, removeMessage } from "../actions.ts";

type Words = { mailbox: Catalogue["mailbox"]; errors: Catalogue["errors"]; common: Catalogue["common"]; write: Catalogue["write"] };
type Row = { id: string; from: string; address: string; subject: string; body: string; when: string; files: string[]; hasOriginal: boolean };

export function MailToFile({ messages, candidates, t }: { messages: Row[]; candidates: { id: string; label: string; email: string }[]; t: Words }) {
  return <ul className="to-file">{messages.map(m => <Item key={m.id} m={m} candidates={candidates} t={t} />)}</ul>;
}

function Item({ m, candidates, t }: { m: Row; candidates: { id: string; label: string; email: string }[]; t: Words }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  // Those who wrote from this address first.
  const same = candidates.filter(c => c.email === m.address);
  const [chosen, setChosen] = useState(same[0]?.id ?? "");
  const w = t.mailbox;
  return (
    <li className="panel">
      <div className="panel-head"><strong>{m.subject || t.write.noSubject}</strong><span className="muted small">{m.when}</span></div>
      <p className="muted small">{m.from}</p>
      <p className="pre mail-body">{m.body}</p>
      {(m.files.length > 0 || m.hasOriginal) && (
        <ul className="mail-files">
          {m.files.map((f, i) => <li key={i}><a href={`/chest/messages/${m.id}/files/${i}`} download><Download />{f}</a></li>)}
          {m.hasOriginal && <li><a href={`/chest/messages/${m.id}/files/original`} download><Download />{t.write.original}</a></li>}
        </ul>
      )}
      <form className="inline-form" onSubmit={e => {
        e.preventDefault();
        start(async () => {
          const r = await fileMessage(m.id, chosen);
          if (!r.ok) return toast(format(t.errors[r.error], r.values ?? {}));
          toast(w.filed);
        });
      }}>
        <label className="visually-hidden" htmlFor={`file-${m.id}`}>{w.fileWith}</label>
        <select id={`file-${m.id}`} className="field" value={chosen} onChange={e => setChosen(e.target.value)} required>
          <option value="">{w.fileWith}…</option>
          {same.length > 0 && <optgroup label={w.sameAddress}>{same.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>}
          <optgroup label={w.everyone}>{candidates.filter(c => c.email !== m.address).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
        </select>
        <button type="submit" className="button small" disabled={pending || !chosen}>{w.file}</button>
        <button type="button" className="icon-button" disabled={pending} title={w.remove} onClick={() => start(async () => {
          const r = await removeMessage(m.id);
          if (!r.ok) return toast(format(t.errors[r.error], r.values ?? {}));
          toast(w.removed);
        })}><Bin /><span className="visually-hidden">{w.remove}</span></button>
      </form>
    </li>
  );
}
