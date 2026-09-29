"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Mail, Meeting, Note, Phone } from "../../../components/icons.tsx";
import { useToast } from "../../../components/toast.tsx";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import type { LoggedKind } from "../../../lib/model.ts";
import { logActivity, removeActivity } from "../actions.ts";

// Log what happened in one tap: each kind is its own button. A call, a
// meeting or an email may go without words; a note needs some.
export function Composer({ on, t }: { on: { deal?: string; contact?: string; company?: string }; t: Catalogue }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  // "Log a call", never "Call": the page's own "Call" dials the number.
  const kinds: { kind: LoggedKind; label: string; icon: ReactNode }[] = [
    { kind: "call", label: t.log.call, icon: <Phone /> },
    { kind: "meeting", label: t.log.meeting, icon: <Meeting /> },
    { kind: "email", label: t.log.email, icon: <Mail /> },
    { kind: "note", label: t.log.note, icon: <Note /> },
  ];
  function log(kind: LoggedKind) {
    setError(null);
    if (kind === "note" && body.trim() === "") return setError(t.log.noteNeedsText);
    const text = body;
    setBody("");
    start(async () => {
      const r = await logActivity(on, kind, text);
      if (!r.ok) {
        setBody(text);
        return setError(format(t.errors[r.error], r.values));
      }
      toast(format(t.log.logged, { kind: t.timeline.kinds[kind] }), { label: t.common.undo, run: () => start(async () => { await removeActivity(r.value.id); }) });
    });
  }
  return (
    <section className="composer" aria-labelledby="log-title">
      <h2 id="log-title" className="visually-hidden">{t.log.title}</h2>
      <label className="visually-hidden" htmlFor="log-body">{t.log.what}</label>
      <textarea id="log-body" className="field" rows={2} value={body} onChange={e => setBody(e.target.value)} maxLength={5000} placeholder={t.log.placeholder} aria-describedby={error ? "log-error" : undefined} />
      <div className="kinds" role="group" aria-label={t.log.as}>
        {kinds.map(k => <button key={k.kind} type="button" className="button small quiet" disabled={pending} onClick={() => log(k.kind)}>{k.icon}{k.label}</button>)}
      </div>
      {error && <p className="error" id="log-error" role="alert">{error}</p>}
    </section>
  );
}
