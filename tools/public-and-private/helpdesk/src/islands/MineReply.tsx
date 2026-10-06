import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";
import { Attachments, filesPending, readyFiles, type PickedFile } from "../components/attachments.tsx";
import { Send } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { limits } from "../shared/model.ts";

// Writing again on one's own request, with files (only for this request:
// the server checks it is theirs). Sent, the box empties and the thread
// shows it; refused, the text stays and the toast says why. A message
// sent is never undone (it reached the team).
export function MineReply({ number, t }: { number: number; t: { mine: Catalogue["mine"]; errors: Catalogue["errors"]; files: Catalogue["kit"]["files"]; typesPlain: string } }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [pending, setPending] = useState(false);
  const waiting = filesPending(files);
  async function send() {
    setPending(true);
    const r = await call("writeMine", { number, body: text, files: readyFiles(files) });
    setPending(false);
    if (!r.ok) return;
    setText("");
    setFiles([]);
    toast({ text: t.mine.sent });
  }
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); if (text.trim() && !waiting && !pending) void send(); }}>
      <label htmlFor="mine-message" className="visually-hidden">{t.mine.reply}</label>
      <textarea id="mine-message" className="field" rows={5} value={text} onChange={e => setText(e.target.value)} maxLength={limits.body} placeholder={t.mine.replyPlaceholder} />
      <Attachments files={files} setFiles={setFiles} kind="team" label={t.mine.files} plainTypes={t.typesPlain} t={{ files: t.files, errors: t.errors }}
        grant={async (type, size) => {
          const up = await call("mineUpload", { number, type, size }, { quiet: true, refresh: false });
          return up.ok ? { ok: true, url: up.value.url } : { ok: false, message: up.message };
        }} />
      <div><button type="submit" className="ck-button" disabled={pending || waiting || !text.trim()} title={waiting ? t.files.wait : undefined}><Send />{t.mine.send}</button></div>
    </form>
  );
}
