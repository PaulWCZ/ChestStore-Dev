import { EmptyState } from "@argentic/chest-ui/components";
import { call, fill as format, toast } from "@argentic/chest-app/client";
import { useId, useRef, useState, type FormEvent } from "react";
import { useBusy } from "../components/busy.ts";
import { File, Pencil, Plus, Trash } from "../components/icons.tsx";

type Words = {
  letters: {
    empty: { title: string; body: string }; addExamples: string; add: string; name: string; body: string; insert: string; placeholders: string;
    save: string; saved: string; edit: string; remove: string; removed: string; cancel: string; fields: Record<string, string>;
  };
};
type Letter = { id: string; name: string; body: string };

// The letters as cards: each opens in place to be edited; deleting one has
// Undo. A field goes where the cursor is, from its button ("{firstDay}").
export function LettersEditor({ letters, fields, t }: { letters: Letter[]; fields: string[]; t: Words }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, run] = useBusy();
  if (letters.length === 0 && editing === null) {
    return (
      <EmptyState icon={<File />} title={t.letters.empty.title} body={t.letters.empty.body}
        action={<>
          <button type="button" className="button" disabled={pending} onClick={() => void run(() => call("addLetterExamples", {}))}>{t.letters.addExamples}</button>
          <button type="button" className="button quiet" onClick={() => setEditing("new")}><Plus />{t.letters.add}</button>
        </>} />
    );
  }
  return (
    <div className="letters">
      <p className="hint">{t.letters.placeholders}</p>
      <ul className="letter-list">
        {letters.map(l => (
          <li key={l.id} id={`letter-${l.id}`} className="card-block letter-card">
            {editing === l.id ? <LetterForm letter={l} fields={fields} t={t} onDone={() => setEditing(null)} /> : (
              <div className="letter-row">
                <div>
                  <h2>{l.name}</h2>
                  <p className="muted small letter-first">{l.body.split("\n").find(line => line.trim()) ?? ""}</p>
                </div>
                <div className="row">
                  <button type="button" className="icon-button" aria-label={format(t.letters.edit, { name: l.name })} onClick={() => setEditing(l.id)}><Pencil /></button>
                  <button type="button" className="icon-button" aria-label={format(t.letters.remove, { name: l.name })} disabled={pending} onClick={() => void run(async () => {
                    const r = await call("removeLetter", { id: l.id, removed: true });
                    if (!r.ok) return;
                    toast({
                      id: `letter-${l.id}`, text: t.letters.removed,
                      undo: async () => {
                        const back = await call("removeLetter", { id: l.id, removed: false }, { quiet: true });
                        return back.ok || back.message;
                      },
                    });
                  })}><Trash /></button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing === "new" ? <div className="card-block section"><LetterForm letter={null} fields={fields} t={t} onDone={() => setEditing(null)} /></div>
        : <p className="section-actions"><button type="button" className="button quiet" onClick={() => setEditing("new")}><Plus />{t.letters.add}</button></p>}
    </div>
  );
}

function LetterForm({ letter, fields, t, onDone }: { letter: Letter | null; fields: string[]; t: Words; onDone: () => void }) {
  const uid = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [name, setName] = useState(letter?.name ?? "");
  const [body, setBody] = useState(letter?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useBusy();
  // A field goes where the cursor is, and the cursor after it.
  const insert = (field: string) => {
    const el = area.current;
    const token = `{${field}}`;
    const at = el ? el.selectionStart : body.length;
    const to = el ? el.selectionEnd : body.length;
    setBody(b => b.slice(0, at) + token + b.slice(to));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    void run(async () => {
      const r = await call("saveLetter", { id: letter?.id ?? null, name, body }, { quiet: true });
      if (!r.ok) { setError(r.message); return; }
      toast({ id: "letter-saved", text: t.letters.saved });
      onDone();
    });
  };
  return (
    <form className="form letter-form" onSubmit={submit} noValidate>
      <div className="field-group">
        <label htmlFor={uid + "name"} className="label">{t.letters.name}</label>
        <input id={uid + "name"} className="field" value={name} maxLength={80} onChange={e => setName(e.target.value)} autoFocus />
      </div>
      <div className="field-group">
        <label htmlFor={uid + "body"} className="label">{t.letters.body}</label>
        <textarea id={uid + "body"} ref={area} className="field letter-body" rows={16} value={body} maxLength={8000} onChange={e => setBody(e.target.value)} />
      </div>
      <div className="field-group" role="group" aria-labelledby={uid + "insert"}>
        <span id={uid + "insert"} className="label">{t.letters.insert}</span>
        <div className="day-chips">
          {fields.map(f => <button key={f} type="button" className="check-chip merge-chip" onClick={() => insert(f)}>{t.letters.fields[f] ?? f}</button>)}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row form-actions">
        <button type="submit" className="button" disabled={pending}>{t.letters.save}</button>
        <button type="button" className="button quiet" onClick={onDone}>{t.letters.cancel}</button>
      </div>
    </form>
  );
}
