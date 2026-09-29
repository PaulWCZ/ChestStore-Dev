"use client";

import { useToast } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Attachments, filesPending, readyFiles, type PickedFile } from "../../../../components/attachments.tsx";
import { Send } from "../../../../components/icons.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../../lib/i18n/index.ts";
import { limits } from "../../../../lib/model.ts";
import { mineUpload, rateMine, writeMine } from "../../actions.ts";

// Writing again on one's own request, with files (only for this request:
// the server checks it is theirs). Sent, the box empties and the thread
// shows it; refused, the text stays and the toast says why. A message
// sent is never undone (it reached the team).
export function MineReply({ number, t }: { number: number; t: { mine: Catalogue["mine"]; errors: Catalogue["errors"]; files: FileWords & Catalogue["files"]; typesPlain: string } }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const waiting = filesPending(files);
  const send = () => start(async () => {
    const r = await writeMine(number, text, JSON.parse(readyFiles(files)) as { ref: string; name: string }[]);
    if (!r.ok) return void toast({ text: format(t.errors[r.error], { max: limits.body }), tone: "error" });
    setText("");
    setFiles([]);
    toast({ text: t.mine.sent });
    router.refresh();
  });
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); if (text.trim() && !waiting) send(); }}>
      <label htmlFor="mine-message" className="visually-hidden">{t.mine.reply}</label>
      <textarea id="mine-message" className="field" rows={5} value={text} onChange={e => setText(e.target.value)} maxLength={limits.body} placeholder={t.mine.replyPlaceholder} />
      <Attachments files={files} setFiles={setFiles} grant={(type, size) => mineUpload(number, type, size)} kind="team" label={t.mine.files} plainTypes={t.typesPlain} t={{ files: t.files, errors: t.errors }} />
      <div><button type="submit" className="ck-button" disabled={pending || waiting || !text.trim()} title={waiting ? t.files.wait : undefined}><Send />{t.mine.send}</button></div>
    </form>
  );
}

// "Did we solve your problem?" on one's own closed request: one click; one
// may change one's mind.
export function MineRate({ number, rating, t }: { number: number; rating: "good" | "bad" | null; t: Catalogue["public"] }) {
  const [chosen, setChosen] = useState(rating);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const choose = (value: "good" | "bad") => start(async () => {
    const r = await rateMine(number, value);
    if (r.ok) {
      setChosen(value);
      setDone(true);
    }
  });
  return (
    <section className="rate" aria-labelledby="rate-title">
      <h2 id="rate-title">{t.rateTitle}</h2>
      <div className="row">
        <button type="button" className={`ck-button ${chosen === "good" ? "" : "ck-button-quiet"}`} aria-pressed={chosen === "good"} disabled={pending} onClick={() => choose("good")}>{t.rateGood}</button>
        <button type="button" className={`ck-button ${chosen === "bad" ? "" : "ck-button-quiet"}`} aria-pressed={chosen === "bad"} disabled={pending} onClick={() => choose("bad")}>{t.rateBad}</button>
      </div>
      {done && <p role="status" className="muted">{t.rated}</p>}
    </section>
  );
}
