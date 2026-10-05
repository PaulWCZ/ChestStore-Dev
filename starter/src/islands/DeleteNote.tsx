import { useState } from "react";
import { call, toast } from "../core/client.tsx";

// Delete, with an Undo that tells the truth: the note goes from the page
// at once (call() refreshes it), the toast offers it back.
export function DeleteNote({ id, words }: { id: string; words: { remove: string; removed: string } }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
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
    <button type="button" className="ck-button ck-button-quiet ck-button-small" aria-describedby={`note-${id}-text`} disabled={busy} onClick={() => void remove()}>
      {words.remove}
    </button>
  );
}
