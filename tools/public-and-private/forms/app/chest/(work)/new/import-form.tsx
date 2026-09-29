"use client";

import { useState, useTransition } from "react";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { importForm } from "../../actions.ts";

// Bring a form from Google Forms or Typeform: its file (JSON, as their
// APIs give it) chosen or pasted; the questions arrive as a draft.
export function ImportForm({ t, errors }: { t: Catalogue["create"]; errors: Catalogue["errors"] }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const send = (value: string) => start(async () => {
    const r = await importForm(value);
    if (r && !r.ok) toast(format(errors[r.error] ?? errors.unknown, r.values ?? {}));
  });
  return (
    <details className="import-box">
      <summary>{t.importTitle}</summary>
      <p className="hint">{t.importHint}</p>
      <label className="button quiet small file-button">
        {pending ? t.importing : t.importFile}
        <input type="file" accept="application/json,.json" disabled={pending} onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send(await f.text()); }} />
      </label>
      <label className="mini block">
        <span className="mini-label">{t.importPaste}</span>
        <textarea className="field embed-code" rows={4} value={text} onChange={e => setText(e.target.value)} />
      </label>
      <div><button type="button" className="button small" disabled={pending || text.trim() === ""} onClick={() => send(text)}>{t.importGo}</button></div>
    </details>
  );
}
