import { call, navigate, toast } from "@argentic/chest-app/client";
import { Confirm } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Download, Trash, Upload } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";
import { limits } from "../shared/model.ts";
import { upload, type UploadWords } from "./upload.ts";

type Words = { item: Catalogue["item"]; errors: UploadWords; common: Catalogue["common"] };

// The purchase invoice (for the accountant): the browser sends it to the
// Chest itself (the tool grants one upload, then checks it arrived),
// replacing the old one. Managers only.
export function InvoiceControl({ id, name, has, t }: { id: string; name: string; has: boolean; t: Words }) {
  const [sending, setSending] = useState(false);
  // Deleting the file cannot be undone: it asks first, in the page.
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const fail = (text: string) => toast({ text, tone: "error" });

  async function send(file: File) {
    setSending(true);
    const refused = await upload("invoice", id, file, limits.invoiceSize, t.errors);
    setSending(false);
    if (refused) fail(refused);
  }

  async function remove() {
    setBusy(true);
    const r = await call("removeInvoice", { id });
    setBusy(false);
    if (r.ok) setAsking(false);
  }

  return (
    <section className="panel" aria-labelledby="invoice">
      <h2 id="invoice">{t.item.invoice}</h2>
      {sending ? <p className="hint" role="status">{t.item.invoiceSending}</p> : (
        <div className="row">
          {has && <a className="button quiet small" href={`/chest/items/${id}/invoice`} target="_blank" rel="noopener"><Download />{t.item.openInvoice}</a>}
          <label className="button quiet small file-input">
            <Upload />{has ? t.item.replaceInvoice : t.item.addInvoice}
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
          </label>
          {has && <button type="button" className="button link small" onClick={() => setAsking(true)}><Trash />{t.item.removeInvoice}</button>}
        </div>
      )}
      <p className="hint">{has ? t.item.invoiceHint : `${t.item.invoiceNone} ${t.item.invoiceHint}`}</p>
      <Confirm open={asking} title={format(t.item.invoiceDeleteTitle, { name })} body={t.item.invoiceDeleteBody} confirmLabel={t.item.removeInvoice} cancelLabel={t.common.cancel} busy={busy} onConfirm={() => void remove()} onCancel={() => setAsking(false)} />
    </section>
  );
}
