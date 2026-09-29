"use client";

import { PeoplePicker, useToast } from "@argentic/chest-ui/components";
import { localSearch, type PeoplePickerWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Cross, Info, Picture, Star } from "../../../components/icons.tsx";
import type { ErrorCode } from "../../../lib/app-error.ts";
import { format } from "../../../lib/i18n/format.ts";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { coverTypes, limits } from "../../../lib/model.ts";
import { declineProposal, proposePost, restoreProposal } from "../actions.ts";

// "Share something": a shout-out to a colleague, or a piece of news with a
// picture if one likes. One screen, two choices, then a few words; it goes
// to the publishers (lib/proposals.ts). The picture goes to the Chest in
// News's three steps (app/chest/api/uploads), as a proposal's picture.
type Words = { propose: Catalogue["propose"]; errors: Catalogue["errors"]; peoplePicker: PeoplePickerWords };
type Colleague = { id: string; name: string };
type Kind = "shoutout" | "info";

export function ProposeForm({ colleagues, start, locale, t }: { colleagues: Colleague[]; start: Kind; locale: string; t: Words }) {
  const w = t.propose;
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>(start);
  const [colleague, setColleague] = useState<Colleague | null>(null);
  const [title, setTitle] = useState("");
  // The headline follows the colleague until the person types their own.
  const typed = useRef(false);
  const [body, setBody] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; field: "colleague" | "title" | null } | null>(null);
  const [saving, startSave] = useTransition();
  const find = useMemo(() => localSearch(colleagues.map(c => ({ kind: "member" as const, id: c.id, name: c.name }))), [colleagues]);
  const say = (code: ErrorCode, values: Record<string, string | number> = {}) => format(t.errors[code], values);

  function choose(next: Kind) {
    setKind(next);
    if (!typed.current) setTitle(next === "shoutout" && colleague ? format(w.shoutoutTitle, { name: first(colleague.name) }) : "");
  }
  function pick(next: Colleague | null) {
    setColleague(next);
    if (!typed.current) setTitle(next ? format(w.shoutoutTitle, { name: first(next.name) }) : "");
  }

  async function upload(file: File) {
    if (!(coverTypes as readonly string[]).includes(file.type)) return void toast({ text: say("not_image"), tone: "error" });
    if (file.size > limits.coverSize) return void toast({ text: say("file_too_large"), tone: "error" });
    setSending(true);
    try {
      const grant = await fetch("/chest/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "cover", size: file.size, type: file.type }) });
      const up = await grant.json() as { url?: string; error?: ErrorCode };
      if (!grant.ok || !up.url) return void toast({ text: say(up.error ?? "unknown"), tone: "error" });
      const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) return void toast({ text: say(put.status === 413 ? "file_too_large" : put.status === 415 ? "not_image" : "file_missing"), tone: "error" });
      const { name } = await put.json() as { name: string };
      const kept = await fetch("/chest/api/uploads", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, fileName: file.name, role: "cover" }) });
      const saved = await kept.json() as { id?: string; error?: ErrorCode };
      if (!kept.ok || !saved.id) return void toast({ text: say(saved.error ?? "file_missing"), tone: "error" });
      setCover(saved.id);
    } catch {
      toast({ text: say("unavailable"), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  function send() {
    if (kind === "shoutout" && !colleague) return setError({ text: say("no_person"), field: "colleague" });
    if (!title.trim()) return setError({ text: say("empty"), field: "title" });
    setError(null);
    startSave(async () => {
      const r = await proposePost({ kind, title, body, colleague: kind === "shoutout" ? colleague?.id ?? null : null, cover });
      if (!r.ok) return setError({ text: r.error === "too_many" ? format(w.full, r.values ?? {}) : say(r.error, r.values ?? {}), field: r.error === "no_person" || r.error === "yourself" ? "colleague" : null });
      toast({ id: "proposed", text: w.sent });
      typed.current = false;
      setColleague(null);
      setTitle("");
      setBody("");
      setCover(null);
      router.refresh();
    });
  }

  return (
    <form className="propose-form" onSubmit={e => { e.preventDefault(); send(); }} noValidate>
      <fieldset className="kinds two">
        <legend>{w.kind}</legend>
        {(["shoutout", "info"] as const).map(k => (
          <label key={k} className={"kind-choice" + (kind === k ? " on" : "")}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => choose(k)} />
            {k === "shoutout" ? <Star /> : <Info />}
            <span><strong>{k === "shoutout" ? w.shoutout : w.info}</strong><small>{k === "shoutout" ? w.shoutoutHint : w.infoHint}</small></span>
          </label>
        ))}
      </fieldset>
      {kind === "shoutout" && (
        <div className="field-group">
          <PeoplePicker id="colleague" label={w.colleague} search={find} value={colleague ? [{ kind: "member", id: colleague.id, name: colleague.name }] : []} onChange={list => pick(list[0] ? { id: list[0].id, name: list[0].name } : null)} labels={{ ...t.peoplePicker, placeholder: w.colleaguePick }} lang={locale} />
        </div>
      )}
      <div className="field-group">
        <label htmlFor="proposal-title">{w.headline}</label>
        <input id="proposal-title" className="field" value={title} maxLength={limits.title} aria-invalid={error?.field === "title"} onChange={e => { typed.current = true; setTitle(e.target.value); }} />
      </div>
      <div className="field-group">
        <label htmlFor="proposal-body">{w.text}</label>
        <textarea id="proposal-body" className="field" rows={5} value={body} maxLength={5000} placeholder={kind === "shoutout" ? w.shoutoutPlaceholder : w.infoPlaceholder} onChange={e => setBody(e.target.value)} />
      </div>
      <div className="field-group">
        {cover ? (
          <div className="cover-preview small">
            <img src={`/chest/files/${cover}?size=256`} alt="" />
            <button type="button" className="button quiet small" onClick={() => setCover(null)}><Cross />{w.pictureRemove}</button>
          </div>
        ) : (
          <label className="button quiet small file-input">
            <Picture />{sending ? w.uploading : w.picture}
            <input type="file" accept={coverTypes.join(",")} disabled={sending} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </label>
        )}
        <p className="hint">{w.pictureHint}</p>
      </div>
      {error && <p className="error" role="alert">{error.text}</p>}
      <div className="row">
        <button type="submit" className="button" disabled={saving || sending}>{saving ? w.sending : w.send}</button>
      </div>
    </form>
  );
}

// A first name, for the headline "Thank you, Léa!".
const first = (name: string) => name.split(/\s+/u)[0] ?? name;

// "Take it back" on one's own proposal waiting, with Undo.
export function TakeBack({ id, t, errors }: { id: string; t: Catalogue["propose"]; errors: Catalogue["errors"] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  return (
    <button type="button" className="button quiet small" disabled={busy} onClick={() => start(async () => {
      const r = await declineProposal(id, null);
      if (!r.ok) return void toast({ text: format(errors[r.error], r.values ?? {}), tone: "error" });
      router.refresh();
      toast({
        id: `proposal-${id}`,
        text: t.takenBackToast,
        undo: async () => {
          const back = await restoreProposal(id);
          if (!back.ok) return format(errors[back.error], back.values ?? {});
          router.refresh();
          return true;
        },
      });
    })}>{t.takeBack}</button>
  );
}
