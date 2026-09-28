"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Photo, Trash } from "../../../../components/icons.tsx";
import { useToast } from "../../../../components/toast.tsx";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { limits } from "../../../../lib/model.ts";

type Words = { item: Catalogue["item"]; errors: Catalogue["errors"] };

// The item's photo: the browser sends it to the Chest itself (the tool
// authorises one upload, then checks it arrived), replacing the old one.
export function PhotoControl({ id, has, t }: { id: string; has: boolean; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const fail = (code: keyof Catalogue["errors"]) => toast(t.errors[code] ?? t.errors.unknown);

  async function send(file: File) {
    if (file.size > limits.photoSize) return fail("file_too_large");
    setSending(true);
    try {
      const grant = await fetch(`/chest/items/${id}/photo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ size: file.size, type: file.type }) });
      const up = await grant.json() as { url?: string; error?: keyof Catalogue["errors"] };
      if (!grant.ok || !up.url) return fail(up.error ?? "unknown");
      const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!put.ok) return fail(put.status === 413 ? "file_too_large" : "file_missing");
      const { name } = await put.json() as { name: string };
      const confirm = await fetch(`/chest/items/${id}/photo`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!confirm.ok) return fail(((await confirm.json()) as { error?: keyof Catalogue["errors"] }).error ?? "file_missing");
      router.refresh();
    } catch {
      fail("unavailable");
    } finally {
      setSending(false);
    }
  }

  async function remove() {
    const r = await fetch(`/chest/items/${id}/photo`, { method: "DELETE" });
    if (!r.ok) return fail("unknown");
    router.refresh();
  }

  return (
    <div className="photo-control row">
      {sending ? <p className="hint" role="status">{t.item.uploading}</p> : (
        <label className="button quiet small file-input">
          <Photo />{has ? t.item.changePhoto : t.item.addPhoto}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
        </label>
      )}
      {has && !sending && <button type="button" className="button link small" onClick={() => void remove()}><Trash />{t.item.removePhoto}</button>}
    </div>
  );
}
