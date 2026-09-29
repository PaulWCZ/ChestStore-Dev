"use client";

import { Dialog, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { askFor } from "../app/chest/actions.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { limits } from "../lib/model.ts";
import { Plus } from "./icons.tsx";

type Words = { requests: Catalogue["requests"]; errors: Catalogue["errors"]; common: Catalogue["common"]; dialog: Catalogue["dialog"] };

// "Ask for something": a few words, and the kind of thing if one knows it;
// the equipment managers hear it in their bell.
export function AskButton({ categories, t, primary = false }: { categories: { id: string; name: string }[]; t: Words; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const w = t.requests;
  function send() {
    start(async () => {
      const r = await askFor({ body, ...(categoryId ? { categoryId } : {}) });
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      setOpen(false);
      setBody("");
      setCategoryId("");
      // The managers were told (their bell): sent, never an Undo.
      toast({ text: w.sent, sent: true });
      router.refresh();
    });
  }
  return (
    <>
      <button type="button" className={primary ? "button" : "button quiet keep-label"} onClick={() => { setError(null); setOpen(true); }}><Plus /><span>{w.ask}</span></button>
      <Dialog open={open} title={w.title} labels={t.dialog} dirty={body.trim() !== ""} onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={e => { e.preventDefault(); send(); }}>
          <div className="form-field">
            <label className="label" htmlFor="ask-body">{w.what}</label>
            <textarea id="ask-body" className="field" rows={3} value={body} maxLength={limits.request} placeholder={w.placeholder} onChange={e => setBody(e.target.value)} required />
          </div>
          <div className="form-field">
            <label className="label" htmlFor="ask-kind">{w.kind} <span className="muted">({t.common.optional})</span></label>
            <select id="ask-kind" className="field" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">{w.anyKind}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row end">
            <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.common.cancel}</button>
            <button type="submit" className="button" disabled={pending || body.trim() === ""}>{w.submit}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
