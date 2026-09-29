"use client";

import { Dialog, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reportProblem } from "../app/chest/actions.ts";
import type { Catalogue } from "../lib/i18n/index.ts";
import { format } from "../lib/i18n/format.ts";
import { limits } from "../lib/model.ts";
import { Alert } from "./icons.tsx";

type Words = { report: Catalogue["report"]; errors: Catalogue["errors"]; common: Catalogue["common"]; dialog: Catalogue["dialog"] };

// "Report a problem" on something I hold: a few words, sent to the
// equipment managers (their bell) and kept in the item's history.
export function ReportButton({ id, name, label, t, primary = false }: { id: string; name: string; label: string; t: Words; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  function send() {
    start(async () => {
      const r = await reportProblem(id, text);
      if (!r.ok) return setError(format(t.errors[r.error], r.values));
      setOpen(false);
      setText("");
      // The managers were told (their bell): sent, never an Undo.
      toast({ text: t.report.done, sent: true });
      router.refresh();
    });
  }
  return (
    <>
      <button type="button" className={primary ? "button" : "button quiet small"} onClick={() => { setError(null); setOpen(true); }}><Alert />{label}</button>
      <Dialog open={open} title={format(t.report.title, { name })} labels={t.dialog} dirty={text.trim() !== ""} onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={e => { e.preventDefault(); send(); }}>
          <label className="label" htmlFor={`report-${id}`}>{t.report.what}</label>
          <textarea id={`report-${id}`} className="field" rows={4} value={text} maxLength={limits.problem} placeholder={t.report.placeholder} onChange={e => setText(e.target.value)} required />
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row end">
            <button type="button" className="button quiet" onClick={() => setOpen(false)}>{t.common.cancel}</button>
            <button type="submit" className="button" disabled={pending || text.trim() === ""}>{t.report.submit}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
