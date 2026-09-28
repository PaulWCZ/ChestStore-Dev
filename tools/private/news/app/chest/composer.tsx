"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bold, Clip, Cross, Group, Italic, LinkIcon, List, Picture, kindIcons } from "../../components/icons.tsx";
import { RichText } from "../../components/rich-text.tsx";
import { useToast } from "../../components/toast.tsx";
import type { ErrorCode } from "../../lib/app-error.ts";
import { format } from "../../lib/i18n/format.ts";
import type { Catalogue } from "../../lib/i18n/index.ts";
import { coverTypes, kinds, limits, type Kind } from "../../lib/model.ts";
import { savePost } from "./actions.ts";

// Writing a post: what it is, its headline and text, what the kind needs (a
// day and a place, a colleague), a picture and files, then Publish. A new
// post's draft is kept in this browser until it is published: a closed tab
// loses nothing.
type FileInfo = { id: string; fileName: string; type: string; size: number };
export type ComposerDraft = {
  kind: Kind; title: string; body: string; important: boolean; pinned: boolean; scheduled: boolean;
  publishAt: { day: string; time: string } | null;
  event: { day: string; start: string; end: string; place: string } | null;
  welcome: string | null; cover: FileInfo | null; attachments: FileInfo[];
  // The groups it is kept to; none: everyone.
  groups: string[];
};
type Words = { composer: Catalogue["composer"]; kinds: Catalogue["kinds"]; errors: Catalogue["errors"] };

const draftKey = "news.draft";

// groups: the Chest's groups that give News (a post may be kept to some).
export function Composer({ postId, initial, people, groups, defaults, t }: { postId: string | null; initial: ComposerDraft; people: { id: string; name: string }[]; groups: { id: string; name: string }[]; defaults: { day: string; time: string }; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const w = t.composer;
  const [d, setD] = useState<ComposerDraft>(initial);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [later, setLater] = useState(initial.publishAt !== null);
  const [kept, setKept] = useState(initial.groups.length > 0);
  const [error, setError] = useState<{ text: string; field: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const body = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const editable = postId === null || initial.scheduled;
  const say = (code: ErrorCode, values: Record<string, number | string> = {}) => format(t.errors[code], values);
  const update = (patch: Partial<ComposerDraft>) => setD(current => ({ ...current, ...patch }));

  // A new post's draft comes back after a closed tab, and is kept as it is typed.
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (postId !== null || restoredOnce.current) return;
    restoredOnce.current = true;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const back = JSON.parse(saved) as { d: ComposerDraft; later: boolean };
        if (back?.d && (back.d.title || back.d.body)) {
          const known = (back.d.groups ?? []).filter(g => groups.some(x => x.id === g));
          setD({ ...initial, ...back.d, groups: known, cover: null, attachments: [] });
          setLater(back.later === true);
          setKept(known.length > 0);
          setRestored(true);
        }
      }
    } catch {
      // A draft that cannot be read is left behind.
    }
  }, [postId, initial, groups]);
  useEffect(() => {
    if (postId !== null) return;
    try {
      if (d.title || d.body) localStorage.setItem(draftKey, JSON.stringify({ d: { ...d, cover: null, attachments: [] }, later }));
    } catch {
      // Private browsing: no draft, nothing else changes.
    }
  }, [d, later, postId]);

  function forget() {
    try { localStorage.removeItem(draftKey); } catch { /* nothing kept */ }
  }

  // The marks of the text, around what is selected.
  function wrap(before: string, after: string, placeholder: string, select: "inside" | "after-text" = "inside") {
    const el = body.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const chosen = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + chosen + after + value.slice(e);
    update({ body: next });
    requestAnimationFrame(() => {
      el.focus();
      if (select === "inside") el.setSelectionRange(s + before.length, s + before.length + chosen.length);
      else el.setSelectionRange(s + before.length + chosen.length + 2, s + before.length + chosen.length + after.length - 1);
    });
  }
  function listify() {
    const el = body.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const lines = value.slice(start, e).split("\n").map(l => (l.startsWith("- ") ? l : "- " + l));
    const next = value.slice(0, start) + lines.join("\n") + value.slice(e);
    update({ body: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + lines.join("\n").length, start + lines.join("\n").length); });
  }
  function keys(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "b") { e.preventDefault(); wrap("**", "**", w.bold.toLowerCase()); }
    if (e.key === "i") { e.preventDefault(); wrap("*", "*", w.italic.toLowerCase()); }
    if (e.key === "Enter") { e.preventDefault(); void save(); }
  }

  // Files go from the browser to the Chest itself: News authorises one
  // upload, the browser sends it, News checks it arrived and records it.
  async function upload(file: File, role: "cover" | "attachment"): Promise<FileInfo | null> {
    const max = role === "cover" ? limits.coverSize : limits.attachmentSize;
    if (file.size > max) { toast(say("file_too_large")); return null; }
    if (role === "cover" && !(coverTypes as readonly string[]).includes(file.type)) { toast(say("not_image")); return null; }
    setSending(file.name);
    try {
      const type = file.type || "application/octet-stream";
      const grant = await fetch("/chest/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, size: file.size, type }) });
      const up = await grant.json() as { url?: string; error?: ErrorCode };
      if (!grant.ok || !up.url) { toast(say(up.error ?? "unknown")); return null; }
      const put = await fetch(up.url, { method: "PUT", body: file, headers: { "Content-Type": type } });
      if (!put.ok) { toast(say(put.status === 413 ? "file_too_large" : put.status === 415 ? "not_image" : "file_missing")); return null; }
      const { name } = await put.json() as { name: string };
      const confirm = await fetch("/chest/api/uploads", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, fileName: file.name, role }) });
      const saved = await confirm.json() as FileInfo & { error?: ErrorCode };
      if (!confirm.ok) { toast(say(saved.error ?? "file_missing")); return null; }
      return saved;
    } catch {
      toast(say("unavailable"));
      return null;
    } finally {
      setSending(null);
    }
  }

  async function save() {
    if (saving) return;
    if (!d.title.trim()) {
      setError({ text: say("empty"), field: "title" });
      title.current?.focus();
      return;
    }
    if (kept && d.groups.length === 0) {
      setError({ text: say("no_group"), field: "groups" });
      return;
    }
    setError(null);
    setSaving(true);
    const result = await savePost(postId, {
      kind: d.kind,
      title: d.title,
      body: d.body,
      important: d.important,
      pinned: d.pinned,
      publishAt: editable && later && d.publishAt ? d.publishAt : null,
      event: d.kind === "event" ? d.event : null,
      welcome: d.kind === "welcome" ? d.welcome : null,
      groups: kept ? d.groups : [],
      cover: d.cover?.id ?? null,
      attachments: d.attachments.map(a => a.id),
    });
    setSaving(false);
    if (!result.ok) {
      setError({ text: say(result.error, result.values), field: null });
      return;
    }
    forget();
    toast(postId !== null ? w.saved : result.value.published ? w.published : w.scheduledToast);
    router.push(`/chest/posts/${result.value.id}`);
  }

  const kindName = (k: Kind) => t.kinds[k];
  const eventDraft = d.event ?? { day: defaults.day, start: "", end: "", place: "" };
  return (
    <form className="composer" onSubmit={e => { e.preventDefault(); void save(); }} noValidate>
      <div className="composer-head">
        <h1>{postId === null ? w.newTitle : w.editTitle}</h1>
        {restored && (
          <p className="notice">{w.draftRestored} <button type="button" className="link-button" onClick={() => { forget(); setD(initial); setLater(false); setKept(initial.groups.length > 0); setRestored(false); }}>{w.discard}</button></p>
        )}
      </div>

      <div className="composer-grid">
        <div className="composer-main">
          <fieldset className="kinds">
            <legend>{w.kind}</legend>
            {kinds.map(k => {
              const Icon = kindIcons[k];
              return (
                <label key={k} className={"kind-choice" + (d.kind === k ? " on" : "")}>
                  <input type="radio" name="kind" value={k} checked={d.kind === k} onChange={() => update({ kind: k, ...(k === "event" && !d.event ? { event: eventDraft } : {}) })} />
                  <Icon />
                  <span><strong>{kindName(k)}</strong><small>{w.kindHints[k]}</small></span>
                </label>
              );
            })}
          </fieldset>

          <div className="field-group">
            <label htmlFor="title">{w.title}</label>
            <input
              id="title"
              ref={title}
              className="field headline-field"
              value={d.title}
              maxLength={limits.title}
              placeholder={w.titlePlaceholder}
              aria-invalid={error?.field === "title" ? true : undefined}
              aria-describedby={error?.field === "title" ? "form-error" : undefined}
              onChange={e => update({ title: e.target.value })}
            />
          </div>

          {d.kind === "welcome" && (
            <div className="field-group">
              <label htmlFor="welcome">{w.welcome}</label>
              <select id="welcome" className="field" value={d.welcome ?? ""} onChange={e => update({ welcome: e.target.value || null })} aria-describedby="welcome-hint">
                <option value="">{w.welcomePick}</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p id="welcome-hint" className="hint">{w.welcomeHint}</p>
            </div>
          )}

          {d.kind === "event" && (
            <div className="event-fields">
              <div className="field-group">
                <label htmlFor="event-day">{w.eventDay}</label>
                <input id="event-day" type="date" className="field" value={eventDraft.day} onChange={e => update({ event: { ...eventDraft, day: e.target.value } })} />
              </div>
              <div className="field-group">
                <label htmlFor="event-start">{w.eventStart}</label>
                <input id="event-start" type="time" className="field" value={eventDraft.start} onChange={e => update({ event: { ...eventDraft, start: e.target.value } })} aria-describedby="time-hint" />
              </div>
              <div className="field-group">
                <label htmlFor="event-end">{w.eventEnd}</label>
                <input id="event-end" type="time" className="field" value={eventDraft.end} disabled={!eventDraft.start} onChange={e => update({ event: { ...eventDraft, end: e.target.value } })} />
              </div>
              <p id="time-hint" className="hint">{w.timeHint}</p>
              <div className="field-group wide">
                <label htmlFor="event-place">{w.place}</label>
                <input id="event-place" className="field" value={eventDraft.place} maxLength={limits.place} placeholder={w.placePlaceholder} onChange={e => update({ event: { ...eventDraft, place: e.target.value } })} />
              </div>
            </div>
          )}

          <div className="field-group">
            <div className="text-head">
              <label htmlFor="body">{w.body}</label>
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>{w.write}</button>
                <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>{w.preview}</button>
              </div>
            </div>
            {tab === "write" ? (
              <>
                <div className="toolbar" role="toolbar" aria-label={w.toolbar}>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => wrap("**", "**", w.bold.toLowerCase())}><Bold /><span className="visually-hidden">{w.bold}</span></button>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => wrap("*", "*", w.italic.toLowerCase())}><Italic /><span className="visually-hidden">{w.italic}</span></button>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={listify}><List /><span className="visually-hidden">{w.list}</span></button>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => wrap("[", "](https://)", w.linkText, "after-text")}><LinkIcon /><span className="visually-hidden">{w.link}</span></button>
                  <span className="format-help" aria-hidden="true">{w.formatHelp}</span>
                </div>
                <textarea id="body" ref={body} className="field body-field" value={d.body} maxLength={limits.body} placeholder={w.bodyPlaceholder} onChange={e => update({ body: e.target.value })} onKeyDown={keys} />
              </>
            ) : (
              <div className="preview" role="tabpanel" aria-label={w.preview}>
                {d.body.trim() ? <RichText text={d.body} /> : <p className="quiet-text">{w.previewEmpty}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="composer-side">
          <section className="side-card">
            <h2>{w.cover}</h2>
            {d.cover ? (
              <div className="cover-preview">
                <img src={`/chest/files/${d.cover.id}?size=256`} alt="" />
                <button type="button" className="button quiet small" onClick={() => update({ cover: null })}><Cross />{w.removeCover}</button>
              </div>
            ) : (
              <label className="button quiet small file-input">
                <Picture />{w.addCover}
                <input type="file" accept={coverTypes.join(",")} onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const saved = await upload(f, "cover"); if (saved) update({ cover: saved }); } }} />
              </label>
            )}
            <p className="hint">{w.coverHint}</p>
          </section>

          <section className="side-card">
            <h2>{w.attachments}</h2>
            {d.attachments.length > 0 && (
              <ul className="file-list">
                {d.attachments.map(a => (
                  <li key={a.id}>
                    <Clip /><span>{a.fileName}</span>
                    <button type="button" className="icon-button" onClick={() => update({ attachments: d.attachments.filter(x => x.id !== a.id) })}><Cross /><span className="visually-hidden">{format(w.removeFile, { name: a.fileName })}</span></button>
                  </li>
                ))}
              </ul>
            )}
            {d.attachments.length < limits.attachmentsPerPost && (
              <label className="button quiet small file-input">
                <Clip />{w.addFile}
                <input type="file" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { const saved = await upload(f, "attachment"); if (saved) setD(current => ({ ...current, attachments: [...current.attachments, saved] })); } }} />
              </label>
            )}
            {sending && <p className="hint" role="status">{format(w.uploading, { name: sending })}</p>}
          </section>

          <fieldset className="side-card audience" aria-describedby={error?.field === "groups" ? "form-error" : undefined}>
            <legend>{w.audience}</legend>
            <label className="check">
              <input type="radio" name="audience" checked={!kept} onChange={() => setKept(false)} />
              <span><strong>{w.everyone}</strong><small>{w.everyoneHint}</small></span>
            </label>
            {groups.length > 0 ? (
              <>
                <label className="check">
                  <input type="radio" name="audience" checked={kept} onChange={() => setKept(true)} />
                  <span><strong>{w.groups}</strong><small>{w.groupsHint}</small></span>
                </label>
                {kept && (
                  <div className="audience-groups">
                    {groups.map(g => (
                      <label key={g.id} className="check">
                        <input type="checkbox" checked={d.groups.includes(g.id)} onChange={e => update({ groups: e.target.checked ? [...d.groups, g.id] : d.groups.filter(x => x !== g.id) })} />
                        <span><strong><Group /> {g.name}</strong></span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            ) : <p className="hint">{w.noGroups}</p>}
          </fieldset>

          <section className="side-card">
            <h2>{w.options}</h2>
            <label className="check">
              <input type="checkbox" checked={d.important} onChange={e => update({ important: e.target.checked })} />
              <span><strong>{w.important}</strong><small>{w.importantHint}</small></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={d.pinned} onChange={e => update({ pinned: e.target.checked })} />
              <span><strong>{w.pinned}</strong><small>{w.pinnedHint}</small></span>
            </label>
          </section>

          {editable && (
            <fieldset className="side-card when">
              <legend>{w.when}</legend>
              <label className="check"><input type="radio" name="when" checked={!later} onChange={() => setLater(false)} /><span><strong>{w.now}</strong></span></label>
              <label className="check"><input type="radio" name="when" checked={later} onChange={() => { setLater(true); if (!d.publishAt) update({ publishAt: defaults }); }} /><span><strong>{w.later}</strong><small>{w.laterHint}</small></span></label>
              {later && (
                <div className="row">
                  <div className="field-group">
                    <label htmlFor="later-day">{w.laterDay}</label>
                    <input id="later-day" type="date" className="field" value={d.publishAt?.day ?? defaults.day} onChange={e => update({ publishAt: { day: e.target.value, time: d.publishAt?.time ?? defaults.time } })} />
                  </div>
                  <div className="field-group">
                    <label htmlFor="later-time">{w.laterTime}</label>
                    <input id="later-time" type="time" className="field" value={d.publishAt?.time ?? defaults.time} onChange={e => update({ publishAt: { day: d.publishAt?.day ?? defaults.day, time: e.target.value } })} />
                  </div>
                </div>
              )}
            </fieldset>
          )}
        </div>
      </div>

      <div className="composer-bar">
        {error && <p id="form-error" className="error" role="alert">{error.text}</p>}
        <a className="button quiet" href={postId ? `/chest/posts/${postId}` : "/chest"}>{w.cancel}</a>
        <button type="submit" className="button" disabled={saving || sending !== null}>{saving ? w.saving : postId !== null ? w.save : later ? w.schedule : w.publish}</button>
      </div>
    </form>
  );
}
