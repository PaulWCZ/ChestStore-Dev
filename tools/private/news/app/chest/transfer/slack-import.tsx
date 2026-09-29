"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "../../../components/toast.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { undoSlackImport } from "../actions.ts";

// A Slack export: choose the ZIP, then the channel, then import — with
// "Undo" in the toast.
type Channel = { id: string; name: string; messages: number };

export function SlackImport({ t, errors, undo, locale }: { t: Catalogue["transfer"]; errors: Catalogue["errors"]; undo: string; locale: string }) {
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const say = (code: ErrorCode, values: Record<string, number | string> = {}) => format(errors[code], values);

  async function send(f: File, channel: string | null) {
    const response = await fetch("/chest/api/import" + (channel ? "?channel=" + encodeURIComponent(channel) : ""), { method: "POST", headers: { "Content-Type": "application/zip" }, body: f });
    const answer = await response.json() as { error?: ErrorCode; values?: Record<string, number>; channels?: Channel[]; batch?: string; added?: number; skipped?: number; unmatched?: string[] };
    if (!response.ok) throw new Error(say(answer.error ?? "unknown", answer.values));
    return answer;
  }
  async function read(f: File) {
    setFile(f); setChannels(null); setChosen(null); setError(null); setNote(null);
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
      setNote(answer.unmatched?.length ? format(t.unmatched, { names: answer.unmatched.join(", ") }) : null);
      toast(plural(t.imported, added, locale), added > 0 && answer.batch ? {
        label: undo,
        run: async () => {
          const r = await undoSlackImport(answer.batch!);
          toast(r.ok ? plural(t.undone, r.value.count, locale) : say(r.error));
          router.refresh();
        },
      } : undefined, { ms: 12000 });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : say("unknown"));
    } finally {
      setBusy(null);
    }
  }
  const count = channels?.find(c => c.id === chosen)?.messages ?? 0;
  return (
    <div className="stack">
      <label className="button quiet file-input">
        {t.chooseFile}
        <input type="file" accept=".zip,application/zip" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} />
      </label>
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
