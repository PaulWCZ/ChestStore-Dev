import { call, toast } from "@argentic/chest-app/client";
import { useState, type FormEvent } from "react";

// EXAMPLE (Notes). Delete, with an Undo that tells the truth: the note
// goes from the page at once (call() refreshes it), the toast offers it
// back. Without JavaScript the same button posts the form (no Undo).
export function DeleteNote({ id, words }: { id: string; words: { remove: string; removed: string } }) {
  const [busy, setBusy] = useState(false);
  async function remove(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const done = await call("removeNote", { id });
    setBusy(false);
    if (!done.ok) return;
    toast({ id: `note-${id}`, text: words.removed, undo: async () => {
      const back = await call("restoreNote", { id }, { quiet: true });
      return back.ok || back.message;
    } });
  }
  return (
    <form method="post" action="/chest/actions/removeNote" onSubmit={event => void remove(event)}>
      <input type="hidden" name="id" value={id} />
      <button className="ck-button ck-button-quiet ck-button-small" aria-describedby={`note-${id}-text`} aria-busy={busy}>{words.remove}</button>
    </form>
  );
}
