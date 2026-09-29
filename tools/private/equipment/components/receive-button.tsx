"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmReceipt } from "../app/chest/actions.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { limits } from "../lib/model.ts";
import { Dialog } from "./dialog.tsx";
import { Check } from "./icons.tsx";
import { useToast } from "./toast.tsx";

type Words = { receive: Catalogue["receive"]; errors: Catalogue["errors"]; common: Catalogue["common"] };

// "I received it": the holder says the item reached them — with a remark
// if something is off, and, when the company set rules, having read them
// (the version shown is the one accepted). The page wrote the words about
// the handover ("Given by Sofia on 3 October"), in the reader's language.
export function ReceiveButton({ id, name, given, condition, charter, label, t, primary = true }: {
  id: string; name: string; given: string; condition: string | null; charter: { id: string; body: string } | null; label: string; t: Words; primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [remark, setRemark] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const w = t.receive;
  function send() {
    start(async () => {
      const r = await confirmReceipt(id, { remark, ...(charter ? { charterId: charter.id } : {}) });
      if (!r.ok) {
        if (r.error === "charter_changed") router.refresh();
        return setError(format(t.errors[r.error], r.values));
      }
      setOpen(false);
      setRemark("");
      toast(w.done);
      router.refresh();
    });
  }
  return (
    <>
      <button type="button" className={primary ? "button" : "button quiet small"} onClick={() => { setError(null); setOpen(true); }}><Check />{label}</button>
      <Dialog open={open} title={format(w.title, { name })} closeLabel={t.common.close} onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={e => { e.preventDefault(); send(); }}>
          <div>
            <p>{given}</p>
            {condition && <p className="muted">{format(w.condition, { text: condition })}</p>}
          </div>
          {charter && (
            <section className="rules" aria-labelledby={`rules-${id}`}>
              <h3 id={`rules-${id}`}>{w.rules}</h3>
              <p className="rules-text" tabIndex={0}>{charter.body}</p>
            </section>
          )}
          <div className="form-field">
            <label className="label" htmlFor={`remark-${id}`}>{w.remark} <span className="muted">({t.common.optional})</span></label>
            <textarea id={`remark-${id}`} className="field" rows={2} value={remark} maxLength={limits.remark} placeholder={w.remarkPlaceholder} onChange={e => setRemark(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row end">
            <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.common.cancel}</button>
            <button type="submit" className="button" disabled={pending}><Check />{charter ? w.submitRules : w.submit}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
