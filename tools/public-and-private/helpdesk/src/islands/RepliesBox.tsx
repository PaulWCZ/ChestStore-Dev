import { call, fill, toast } from "@argentic/chest-app/client";
import { Box } from "../components/box.tsx";
import { Quote } from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";

// Settings: the saved replies ({customer} and {agent} filled when one is
// inserted) — changed, deleted with Undo, added.
export function RepliesBox({ replies, canReplies, t }: { replies: { id: string; title: string; body: string }[]; canReplies: boolean; t: Catalogue["settings"] }) {
  async function save(input: { id?: string; title: string; body: string }, after?: () => void) {
    const r = await call("saveReply", input);
    if (!r.ok) return;
    if (input.id) toast(t.saved);
    after?.();
  }
  async function remove(reply: { id: string; title: string; body: string }) {
    const x = await call("removeReply", { id: reply.id });
    if (!x.ok) return;
    toast({ id: `reply-${reply.id}`, text: fill(t.replyDeleted, { title: reply.title }), undo: async () => { const back = await call("saveReply", { title: reply.title, body: reply.body }, { quiet: true }); return back.ok || back.message; } });
  }
  return (
    <Box title={t.replies} icon={<Quote />}>
      <p className="hint">{t.repliesHint}</p>
      <ul className="list-rows">
        {replies.map(r => (
          <li key={r.id} id={`reply-${r.id}`}>
            <form className="stack grow" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); void save({ id: r.id, title: String(d.get("title") ?? ""), body: String(d.get("body") ?? "") }); }}>
              <label className="visually-hidden" htmlFor={`t-${r.id}`}>{t.replyTitle}</label>
              <input id={`t-${r.id}`} name="title" className="field" defaultValue={r.title} maxLength={80} disabled={!canReplies} />
              <label className="visually-hidden" htmlFor={`b-${r.id}`}>{t.replyBody}</label>
              <textarea id={`b-${r.id}`} name="body" className="field" rows={3} defaultValue={r.body} maxLength={5000} disabled={!canReplies} />
              {canReplies && <div className="row"><button type="submit" className="button small quiet">{t.save}</button><button type="button" className="link-button danger" onClick={() => void remove(r)}>{t.deleteReply}</button></div>}
            </form>
          </li>
        ))}
      </ul>
      {canReplies && (
        <form className="stack" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); void save({ title: String(d.get("title") ?? ""), body: String(d.get("body") ?? "") }, () => form.reset()); }}>
          <div><label className="label" htmlFor="new-title">{t.replyTitle}</label><input id="new-title" name="title" className="field" maxLength={80} required /></div>
          <div><label className="label" htmlFor="new-body">{t.replyBody}</label><textarea id="new-body" name="body" className="field" rows={3} maxLength={5000} required /></div>
          <div><button type="submit" className="button soft">{t.addReply}</button></div>
        </form>
      )}
    </Box>
  );
}
