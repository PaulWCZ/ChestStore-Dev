import { call, navigate, toast } from "@argentic/chest-app/client";
import { Confirm } from "@argentic/chest-ui/components";
import { useState } from "react";
import { Photo, Trash } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { format } from "../i18n/format.ts";
import { limits } from "../shared/model.ts";
import { upload, type UploadWords } from "./upload.ts";

type Words = { item: Catalogue["item"]; errors: UploadWords; common: Catalogue["common"] };

// The item's photo: the browser sends it to the Chest itself (the tool
// authorises one upload, then checks it arrived), replacing the old one.
export function PhotoControl({ id, name, has, t }: { id: string; name: string; has: boolean; t: Words }) {
  const [sending, setSending] = useState(false);
  // Deleting the file cannot be undone: it asks first, in the page.
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const fail = (text: string) => toast({ text, tone: "error" });

  async function send(file: File) {
    setSending(true);
    const refused = await upload("photo", id, file, limits.photoSize, t.errors);
    setSending(false);
    if (refused) fail(refused);
  }

  async function remove() {
    setBusy(true);
    const r = await call("removePhoto", { id });
    setBusy(false);
    if (r.ok) setAsking(false);
  }

  return (
    <div className="photo-control row">
      {sending ? <p className="hint" role="status">{t.item.uploading}</p> : (
        <label className="button quiet small file-input">
          <Photo />{has ? t.item.changePhoto : t.item.addPhoto}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
        </label>
      )}
      {has && !sending && <button type="button" className="button link small" onClick={() => setAsking(true)}><Trash />{t.item.removePhoto}</button>}
      <Confirm open={asking} title={format(t.item.photoDeleteTitle, { name })} body={t.item.photoDeleteBody} confirmLabel={t.item.removePhoto} cancelLabel={t.common.cancel} busy={busy} onConfirm={() => void remove()} onCancel={() => setAsking(false)} />
    </div>
  );
}
