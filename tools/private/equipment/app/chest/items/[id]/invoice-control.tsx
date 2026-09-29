"use client";

import { Confirm, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Trash, Upload } from "../../../../components/icons.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { format } from "../../../../lib/i18n/format.ts";
import { limits } from "../../../../lib/model.ts";

type Words = { item: Catalogue["item"]; errors: Catalogue["errors"]; common: Catalogue["common"] };

// The purchase invoice (for the accountant): the browser sends it to the
// Chest itself (the tool grants one upload, then checks it arrived),
// replacing the old one. Managers only.
export function InvoiceControl({ id, name, has, t }: { id: string; name: string; has: boolean; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  // Deleting the file cannot be undone: it asks first, in the page.
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const fail = (code: keyof Catalogue["errors"]) => toast({ text: t.errors[code] ?? t.errors.unknown, tone: "error" });

  async function send(file: File) {
    if (file.size > limits.invoiceSize) return fail("file_too_large");
    setSending(true);
    try {
      const grant = await fetch(`/chest/items/${id}/invoice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ size: file.size, type: file.type }) });
      const up = await grant.json() as { url?: string; error?: keyof Catalogue["errors"] };
      if (!grant.ok || !up.url) return fail(up.error ?? "unknown");
      const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!put.ok) return fail(put.status === 413 ? "file_too_large" : "file_missing");
      const { name } = await put.json() as { name: string };
      const confirm = await fetch(`/chest/items/${id}/invoice`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!confirm.ok) return fail(((await confirm.json()) as { error?: keyof Catalogue["errors"] }).error ?? "file_missing");
      router.refresh();
    } catch {
      fail("unavailable");
    } finally {
      setSending(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const r = await fetch(`/chest/items/${id}/invoice`, { method: "DELETE" });
      if (!r.ok) return fail("unknown");
      setAsking(false);
      router.refresh();
    } catch {
      fail("unavailable");
    } finally {
      setBusy(false);
    }
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
