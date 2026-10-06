import { FilePicker, type PickedFile } from "@argentic/chest-ui/components";
import type { FileWords } from "@argentic/chest-ui/components/logic";
import { useState } from "react";
import { call, toast } from "../core/client.tsx";
import type { ErrorCode } from "../core/tool.ts";
import type { Catalogue } from "../i18n/index.ts";
import { format, plural } from "./words.ts";

// A Slack export: choose the ZIP (the kit's file picker: the button or a
// drop, the limit said first; the file stays in the browser and is read
// from here), then the channel, then import — with Undo in the toast.
type Channel = { id: string; name: string; messages: number };

export function SlackImport({ t, errors, files: words, maxSize, locale }: { t: Catalogue["transfer"]; errors: Catalogue["errors"]; files: FileWords; maxSize: number; locale: string }) {
  const [files, setFiles] = useState<readonly PickedFile[]>([]);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const say = (code: ErrorCode, values: Record<string, number | string> = {}) => format(errors[code], values);
  const file = files[0]?.file ?? null;

  async function send(f: File, channel: string | null) {
    const response = await fetch("/chest/transfer/import" + (channel ? "?channel=" + encodeURIComponent(channel) : ""), { method: "POST", headers: { "Content-Type": "application/zip" }, body: f });
    const answer = await response.json() as { error?: ErrorCode; values?: Record<string, number>; channels?: Channel[]; batch?: string; added?: number; skipped?: number; unmatched?: string[] };
    if (!response.ok) throw new Error(say(answer.error ?? "unknown", answer.values));
    return answer;
  }
  // A file chosen (or removed): its channels are read at once.
  function pick(update: (current: readonly PickedFile[]) => PickedFile[]) {
    const next = update(files);
    setFiles(next);
    const f = next[0]?.file ?? null;
    setChannels(null); setChosen(null); setError(null); setNote(null);
    if (f && f !== file) void read(f);
  }
  async function read(f: File) {
    setBusy(format(t.reading, { name: f.name }));
    try {
      const answer = await send(f, null);
      setChannels(answer.channels ?? []);
      setChosen(answer.channels?.[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : say("unknown"));
    } finally {
      setBusy(null);
    }
  }
  async function bring() {
    if (!file || !chosen) return;
    setBusy(format(t.reading, { name: file.name }));
    setError(null);
    try {
      const answer = await send(file, chosen);
      const added = answer.added ?? 0;
      const batch = answer.batch;
      setNote(answer.unmatched?.length ? format(t.unmatched, { names: answer.unmatched.join(", ") }) : null);
      // Nobody was told of an import: it can be taken back whole.
      toast({
        id: `import-${batch ?? chosen}`,
        text: plural(t.imported, added, locale),
        ...(added > 0 && batch ? {
          undo: async () => {
            const r = await call("undoSlackImport", { batch }, { quiet: true });
            return r.ok ? true : r.message;
          },
        } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : say("unknown"));
    } finally {
      setBusy(null);
    }
  }
  const count = channels?.find(c => c.id === chosen)?.messages ?? 0;
  return (
    <div className="stack">
      <FilePicker label={t.chooseFile} files={files} onChange={pick} maxFiles={1} maxSize={maxSize} accept={[".zip", "application/zip"]} labels={words} />
      {busy && <p className="hint" role="status">{busy}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {channels && channels.length > 0 && (
        <fieldset className="channels">
          <legend>{t.channel}</legend>
          {channels.map(c => (
            <label key={c.id} className="check">
              <input type="radio" name="channel" checked={chosen === c.id} onChange={() => setChosen(c.id)} />
              <span><strong>#{c.name}</strong><small>{plural(t.messages, c.messages, locale)}</small></span>
            </label>
          ))}
          <p><button type="button" className="button" disabled={busy !== null || count === 0} onClick={() => void bring()}>{plural(t.importButton, count, locale)}</button></p>
        </fieldset>
      )}
      {note && <p className="notice">{note}</p>}
    </div>
  );
}
