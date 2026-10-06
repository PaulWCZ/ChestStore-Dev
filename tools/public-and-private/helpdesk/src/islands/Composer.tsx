import { call, toast } from "@argentic/chest-app/client";
import { Menu, Tabs } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { useEffect, useRef, useState } from "react";
import { Attachments, filesPending, readyFiles, type PickedFile } from "../components/attachments.tsx";
import { Check, Note, Quote, Send } from "../components/icons.tsx";
import { busy } from "../components/keys.ts";
import type { Catalogue } from "../i18n/index.ts";
import { limits } from "../shared/model.ts";

type Words = {
  answerAs: string; reply: string; note: string; replyPlaceholder: string; notePlaceholder: string; files: string; send: string; sendClose: string; addNote: string;
  saved: string; noSaved: string; noteToast: string; sentColleagueToast: string; sentClosedToast: string; viaPage: string; sentToast: string; closedToast: string;
  typesPlain: string; wait: string; fileWords: FileWords; errors: Catalogue["errors"];
};

// The answer box of a ticket: a reply to the customer, or an internal note
// for the team (its tab turns the box yellow, so a note is never sent by
// mistake), files, Send or Send and close, the saved replies (the kit's
// menu, each with the start of its text). Sending clears the box at once
// and the conversation shows it; a refusal gives the text back. An answer
// that left is never undone ("Answer sent."). Keys: r a reply, n a note,
// Ctrl+Enter sends.
export function Composer({ number, replies, t }: { number: number; replies: { id: string; title: string; filled: string }[]; t: Words }) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy(e)) return;
      if (e.key === "r" || e.key === "n") {
        e.preventDefault();
        setMode(e.key === "r" ? "reply" : "note");
        field.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function send(close: boolean) {
    const body = text.trim();
    if (!body) return field.current?.focus();
    if (filesPending(files)) return toast(t.wait);
    setSending(true);
    const attached = readyFiles(files);
    const result = mode === "reply" ? await call("reply", { number, body, close, files: attached }) : await call("note", { number, body, files: attached });
    setSending(false);
    if (!result.ok) return;
    setText("");
    setFiles([]);
    if (mode === "note") return toast(t.noteToast);
    const delivery = (result.value as { delivery?: string } | null)?.delivery;
    toast({ id: `reply-${number}`, text: delivery === "colleague" ? t.sentColleagueToast : close ? t.sentClosedToast : delivery === "page" ? t.viaPage : t.sentToast, sent: true });
  }
  function insert(body: string) {
    setText(current => (current.trim() ? current.replace(/\s*$/u, "\n\n") + body : body));
    requestAnimationFrame(() => field.current?.focus());
  }
  return (
    <form className={`composer${mode === "note" ? " is-note" : ""}`} onSubmit={e => { e.preventDefault(); void send(false); }}>
      <Tabs label={t.answerAs} current={mode} onChange={id => setMode(id as "reply" | "note")} items={[{ id: "reply", label: t.reply }, { id: "note", label: t.note }]}>
        <label htmlFor="answer" className="visually-hidden">{mode === "reply" ? t.reply : t.note}</label>
        <textarea id="answer" ref={field} value={text} maxLength={limits.body} placeholder={mode === "reply" ? t.replyPlaceholder : t.notePlaceholder}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(false); } }} />
        <div className="attach">
          <Attachments files={files} setFiles={setFiles} kind="team" label={t.files} plainTypes={t.typesPlain} t={{ files: t.fileWords, errors: t.errors }}
            grant={async (type, size) => {
              const up = await call("fileUpload", { type, size }, { quiet: true, refresh: false });
              return up.ok ? { ok: true, url: up.value.url } : { ok: false, message: up.message };
            }} />
        </div>
        <div className="actions">
          {mode === "reply" ? (
            <>
              <button type="submit" className="ck-button" disabled={sending || !text.trim()}><Send />{t.send}</button>
              <button type="button" className="ck-button ck-button-quiet" disabled={sending || !text.trim()} onClick={() => void send(true)}><Check />{t.sendClose}</button>
            </>
          ) : <button type="submit" className="ck-button" disabled={sending || !text.trim()}><Note />{t.addNote}</button>}
          <span className="spacer" />
          {/* The saved replies: the kit's menu, each reply with the start
              of its text under its title, to choose at a glance. */}
          <Menu label={t.saved} showLabel icon={<Quote />} items={replies.length === 0
            ? [{ id: "none", label: t.noSaved, disabled: true }]
            : replies.map(r => ({ id: r.id, label: r.title, note: opening(r.filled), onSelect: () => insert(r.filled) }))} />
        </div>
      </Tabs>
    </form>
  );
}

// The start of a saved reply, on one line: enough to tell it from the others.
function opening(text: string): string {
  const line = text.replace(/\s+/gu, " ").trim();
  return line.length > 90 ? line.slice(0, 89).trimEnd() + "…" : line;
}
