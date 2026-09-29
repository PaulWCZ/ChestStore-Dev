"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Chat, Mask } from "../../../../components/icons.tsx";
import { format } from "../../../../lib/i18n/format.ts";
import type { en } from "../../../../lib/i18n/en.ts";
import { keysFor } from "../../../../lib/reply-keys.ts";
import { answerBack, myReplies, replyToText, type MyConversation } from "../../actions.ts";

// Replies to anonymous free texts (lib/replies.ts), in the browser:
// - ReplyThread, under a text, for those who manage the poll: the
//   conversation so far and a box to reply (the author stays unknown);
// - MyReplies, for the author: this browser's keys open the conversations
//   on their own texts (the server keeps nothing of the asking), with a box
//   to answer back, still anonymous.
type Words = { replies: Record<keyof typeof en.replies, string>; errors: Record<keyof typeof en.errors, string> };
export type ShownReply = { id: string; name: string | null; body: string };

function Messages({ replies, t }: { replies: ShownReply[]; t: Words }) {
  return (
    <ul className="replies">
      {replies.map(r => (
        <li key={r.id} className={r.name === null ? "from-author" : "from-organiser"}>
          <span className="who">{r.name === null ? <><Mask />{t.replies.author}</> : r.name}</span>
          <span className="body">{r.body}</span>
        </li>
      ))}
    </ul>
  );
}

function Box({ label, hint, send, t }: { label: string; hint: string; send: (body: string) => Promise<{ ok: true } | { ok: false; error: keyof typeof en.errors; values?: Record<string, string | number> }>; t: Words }) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const result = await send(body);
    setBusy(false);
    if (!result.ok) return toast({ text: format(t.errors[result.error], result.values ?? {}), tone: "error" });
    // Sent to the other side at once: "sent", no Undo.
    toast({ text: t.replies.sent, sent: true });
    setBody("");
    setOpen(false);
  }
  if (!open) return <button type="button" className="button link reply-open" onClick={() => setOpen(true)}><Chat />{label}</button>;
  return (
    <form className="reply-box" onSubmit={submit}>
      <textarea className="field" rows={3} maxLength={1000} value={body} aria-label={label} placeholder={hint} onChange={e => setBody(e.target.value)} autoFocus />
      <div className="row">
        <button type="submit" className="button small primary" disabled={busy || !body.trim()}>{t.replies.send}</button>
        <button type="button" className="button link" onClick={() => setOpen(false)}>{t.replies.cancel}</button>
      </div>
    </form>
  );
}

export function ReplyThread({ pollId, at, replies, t }: { pollId: string; at: number; replies: ShownReply[]; t: Words }) {
  const router = useRouter();
  return (
    <div className="thread">
      {replies.length > 0 && <Messages replies={replies} t={t} />}
      <Box label={t.replies.reply} hint={t.replies.replyHint} t={t} send={async body => {
        const r = await replyToText(pollId, at, body);
        if (r.ok) router.refresh();
        return r;
      }} />
    </div>
  );
}

export function MyReplies({ pollId, t }: { pollId: string; t: Words }) {
  const [found, setFound] = useState<MyConversation[] | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const load = async (k: string[]) => {
    const r = await myReplies(pollId, k);
    if (r.ok) setFound(r.value);
  };
  useEffect(() => {
    const k = keysFor(pollId);
    setKeys(k);
    if (k.length > 0) void load(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId]);
  // Only texts someone replied to: the rest is already in the results.
  const talks = (found ?? []).filter(c => c.replies.length > 0);
  if (talks.length === 0) return null;
  return (
    <section className="card my-replies" aria-labelledby="my-replies">
      <h2 id="my-replies"><Chat />{t.replies.mineTitle}</h2>
      <p className="note anon"><Mask />{t.replies.mineHint}</p>
      {talks.map(c => (
        <div key={c.at} className="talk">
          <blockquote>{c.body}</blockquote>
          <Messages replies={c.replies} t={t} />
          <Box label={t.replies.answer} hint={t.replies.answerHint} t={t} send={async body => {
            const r = await answerBack(pollId, c.key, body);
            if (r.ok) await load(keys);
            return r;
          }} />
        </div>
      ))}
    </section>
  );
}
