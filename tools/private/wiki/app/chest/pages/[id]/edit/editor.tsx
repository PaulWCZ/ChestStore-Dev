"use client";

import { EditorContent, useEditor, useEditorState, type Editor as TiptapEditor } from "@tiptap/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Dialog } from "../../../../../components/dialog.tsx";
import * as I from "../../../../../components/icons.tsx";
import { useToast } from "../../../../../components/toast.tsx";
import { safeHref, type Doc } from "../../../../../lib/doc.ts";
import type { Catalogue } from "../../../../../lib/i18n/index.ts";
import { format, moment } from "../../../../../lib/i18n/format.ts";
import { draftEverySeconds, heartbeatSeconds } from "../../../../../lib/model.ts";
import { keepEditing, openEditor, publishPage, saveDraft, stopEditing, type Holder } from "../../../actions.ts";
import { extensions } from "./extensions.ts";

type Words = { editor: Catalogue["editor"]; errors: Catalogue["errors"]; common: Catalogue["common"]; missing: string };
type PageInfo = { id: string; title: string; doc: Doc; version: number };
type PickPage = { id: string; title: string; space: string };

type Phase =
  | { kind: "opening" }
  | { kind: "editing"; title: string; doc: unknown; base: number; restored: string | null; older: boolean }
  | { kind: "locked"; holder: Holder };

// The editor: the lock first (one person edits at a time), then the page
// as it is — or the member's own unsaved draft, which comes back. Every
// change is kept as a draft within seconds; "Save" makes it the page's new
// version. "Stop editing" drops the changes, with undo.
export function Editor({ page, pages, fresh = false, locale, t }: { page: PageInfo; pages: PickPage[]; fresh?: boolean; locale: string; t: Words }) {
  const [phase, setPhase] = useState<Phase>({ kind: "opening" });
  const [error, setError] = useState<string | null>(null);
  const open = useCallback(async (takeOver = false) => {
    setError(null);
    const result = await openEditor(page.id, takeOver);
    if (!result.ok) return setError(format(t.errors[result.error], result.values));
    const o = result.value;
    if (o.status === "locked") return setPhase({ kind: "locked", holder: o.holder });
    setPhase(o.draft
      ? { kind: "editing", title: o.draft.title, doc: o.draft.doc, base: o.draft.baseVersion, restored: moment(o.draft.updatedAt, locale), older: o.draft.baseVersion < o.version }
      : { kind: "editing", title: page.title, doc: page.doc, base: o.version, restored: null, older: false });
  }, [page, locale, t.errors]);
  useEffect(() => { void open(); }, [open]);

  if (phase.kind === "opening") {
    return <div className="opening" role="status">{error ? <p className="error" role="alert">{error}</p> : <p className="muted">{t.editor.opening}</p>}</div>;
  }
  if (phase.kind === "locked") {
    const h = phase.holder;
    return (
      <div className="locked">
        <I.Lock />
        <h1>{t.editor.lockedTitle}</h1>
        <p>{h.idle ? format(t.editor.lockedIdle, { name: h.name, time: moment(h.since, locale), minutes: h.minutes }) : format(t.editor.locked, { name: h.name, time: moment(h.since, locale) })}</p>
        {h.idle && <p className="muted">{t.editor.takeOverHint}</p>}
        <div className="row-actions">
          {h.idle && <button type="button" className="button" onClick={() => void open(true)}>{t.editor.takeOver}</button>}
          <Link className={h.idle ? "button quiet" : "button"} href={`/chest/pages/${page.id}`}>{t.editor.backToPage}</Link>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }
  return <Writing key={phase.base + ":" + phase.title} page={page} start={phase} pages={pages} fresh={fresh} locale={locale} t={t} />;
}

type Status = { kind: "clean" } | { kind: "nothing" } | { kind: "saving" } | { kind: "draft"; at: string } | { kind: "offline" };

function Writing({ page, start, pages, fresh, locale, t }: { page: PageInfo; start: Extract<Phase, { kind: "editing" }>; pages: PickPage[]; fresh: boolean; locale: string; t: Words }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(start.title);
  const [status, setStatus] = useState<Status>({ kind: "clean" });
  const [lost, setLost] = useState<Holder | null>(null);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = useRef(false);
  // Anything typed since the editor opened (the title too).
  const touched = useRef(start.restored !== null);
  // Leaving through "Save" or "Stop editing": the lock is given back there.
  const closing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const titleRef = useRef(title);
  const fileInput = useRef<HTMLInputElement>(null);
  const titles = useMemo(() => new Map(pages.map(p => [p.id, p.title])), [pages]);
  // The editor's callbacks are set once: they reach the editor and the
  // latest functions through refs.
  const editorRef = useRef<TiptapEditor | null>(null);
  const changedRef = useRef<() => void>(() => {});
  const uploadRef = useRef<(file: File) => Promise<void>>(async () => {});

  useEffect(() => {
    if (start.restored) toast(format(t.editor.restored, { time: start.restored }));
  }, [start.restored, t.editor.restored, toast]);

  const editor = useEditor({
    extensions: extensions({ placeholder: t.editor.bodyPlaceholder, title: id => titles.get(id) ?? t.missing }),
    content: start.doc as object,
    immediatelyRender: false,
    // The page's policy allows no style element without its nonce: the
    // editor's base styles are in globals.css instead.
    injectCSS: false,
    editorProps: {
      attributes: { class: "prose editable", "aria-label": t.editor.bodyPlaceholder, spellcheck: "true" },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (files.length === 0) return false;
        for (const f of files) void uploadRef.current(f);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
        if (files.length === 0) return false;
        event.preventDefault();
        for (const f of files) void uploadRef.current(f);
        return true;
      },
    },
    onUpdate: () => changedRef.current(),
  });
  useEffect(() => { editorRef.current = editor; }, [editor]);

  // The draft: saved a few seconds after the last change.
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const current = editorRef.current;
    if (!dirty.current || !current) return;
    dirty.current = false;
    setStatus({ kind: "saving" });
    const result = await saveDraft(page.id, { title: titleRef.current, doc: JSON.stringify(current.getJSON()), baseVersion: start.base }).catch(() => null);
    if (!result || !result.ok) {
      dirty.current = true;
      setStatus({ kind: "offline" });
      return;
    }
    setStatus({ kind: "draft", at: moment(new Date(), locale) });
    setLost(result.value.holder);
  }, [page.id, start.base, locale]);
  const changed = useCallback(() => {
    dirty.current = true;
    touched.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), draftEverySeconds * 1000);
  }, [flush]);
  changedRef.current = changed;
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") void flush(); };
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = t.editor.leave; } };
    // Gone without "Save" or "Stop editing" (tab closed, back button, a
    // link elsewhere): the lock goes back at once, with the latest draft
    // when it fits in a beacon (else the one saved seconds ago stays).
    const leave = () => {
      if (closing.current) return;
      clearTimeout(timer.current);
      const current = editorRef.current;
      let body = "";
      if (dirty.current && current) {
        const draft = JSON.stringify({ title: titleRef.current, doc: current.getJSON(), baseVersion: start.base });
        if (draft.length < 60_000) body = draft;
      }
      navigator.sendBeacon(`/chest/api/pages/${page.id}/leave`, new Blob([body], { type: "text/plain" }));
      dirty.current = false;
    };
    // Back from the browser's cache: the editor is open again.
    const back = (e: PageTransitionEvent) => { if (e.persisted) void keepEditing(page.id).then(r => { if (r.ok) setLost(r.value.holder); }); };
    // Still here: the lock stays, and a lock someone else took shows.
    const beat = setInterval(() => void keepEditing(page.id).then(r => { if (r.ok) setLost(r.value.holder); }).catch(() => {}), heartbeatSeconds * 1000);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", back);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", back);
      clearInterval(beat);
      leave();
    };
  }, [flush, page.id, start.base, t.editor.leave]);

  // Just created: the cursor waits in the page, so the first words land.
  useEffect(() => {
    if (fresh && editor) editor.commands.focus("start");
  }, [fresh, editor]);

  function save() {
    if (!editor) return;
    setError(null);
    // Nothing typed: nothing to save (and no "Saved." for an empty page).
    if (!touched.current) {
      setStatus({ kind: "nothing" });
      editor.commands.focus();
      return;
    }
    startSave(async () => {
      clearTimeout(timer.current);
      const result = await publishPage(page.id, { title: titleRef.current, doc: JSON.stringify(editor.getJSON()), baseVersion: start.base });
      if (!result.ok) {
        if (result.error === "locked") await flush();
        return setError(format(t.errors[result.error], result.values));
      }
      dirty.current = false;
      closing.current = true;
      router.push(`/chest/pages/${page.id}?saved=${result.value.version}${result.value.replaced ? `&over=${result.value.replaced}` : ""}`);
    });
  }

  async function stop() {
    if (!editor) return;
    clearTimeout(timer.current);
    const hadChanges = dirty.current || status.kind !== "clean" || start.restored !== null;
    const keep = { title: titleRef.current, doc: JSON.stringify(editor.getJSON()), baseVersion: start.base };
    dirty.current = false;
    closing.current = true;
    await stopEditing(page.id, false);
    router.push(`/chest/pages/${page.id}`);
    if (hadChanges) {
      toast(t.editor.discarded, { label: t.editor.undo, run: async () => {
        await saveDraft(page.id, keep);
        router.push(`/chest/pages/${page.id}/edit`);
      } });
    }
  }

  // A file from the computer: to the Chest directly, then into the page —
  // an image shows, another file is a link to download it.
  async function upload(file: File) {
    const editor = editorRef.current;
    if (!editor) return;
    setBusy(format(t.editor.uploading, { name: file.name }));
    try {
      const refuse = async (r: Response) => {
        const body = (await r.json().catch(() => ({}))) as { error?: keyof Catalogue["errors"] };
        throw new Error(t.errors[body.error ?? "unknown"] ?? t.errors.unknown);
      };
      const asked = await fetch(`/chest/api/pages/${page.id}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ size: file.size }) });
      if (!asked.ok) await refuse(asked);
      const { url } = (await asked.json()) as { url: string };
      const sent = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!sent.ok) throw new Error(sent.status === 413 ? t.errors.file_too_large : t.errors.unknown);
      const { name } = (await sent.json()) as { name: string };
      const kept = await fetch(`/chest/api/pages/${page.id}/upload`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, fileName: file.name }) });
      if (!kept.ok) await refuse(kept);
      const saved = (await kept.json()) as { id: string; image: boolean; fileName: string };
      if (saved.image) editor.chain().focus().setImage({ src: `/chest/files/${saved.id}`, alt: saved.fileName.replace(/\.[a-z0-9]+$/iu, "") }).run();
      else editor.chain().focus().insertContent([{ type: "text", text: saved.fileName, marks: [{ type: "link", attrs: { href: `/chest/files/${saved.id}?download` } }] }, { type: "text", text: " " }]).run();
      toast(format(t.editor.uploaded, { name: saved.fileName }));
    } catch (e) {
      toast(e instanceof Error ? e.message : t.errors.unknown);
    } finally {
      setBusy(null);
    }
  }

  uploadRef.current = upload;

  const statusText = status.kind === "nothing" ? t.editor.status.nothing : status.kind === "saving" ? t.editor.status.saving : status.kind === "draft" ? format(t.editor.status.draft, { time: status.at }) : status.kind === "offline" ? t.editor.status.offline : t.editor.status.clean;

  return (
    <div className="writer" onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); } }}>
      <div className="writer-bar">
        <button type="button" className="button quiet" onClick={() => void stop()}><I.Back /><span className="label">{t.editor.back}</span></button>
        <span className={`save-status ${status.kind}`} role="status" aria-live="polite">{busy ?? statusText}</span>
        <button type="button" className="button" onClick={save} disabled={saving || lost !== null}>{saving ? t.editor.saving : t.editor.save}</button>
      </div>
      {editor && <Toolbar editor={editor} t={t} onLink={() => setLinkOpen(true)} onPick={() => setPickOpen(true)} onFile={() => fileInput.current?.click()} />}
      <input ref={fileInput} type="file" hidden multiple onChange={e => { for (const f of [...(e.target.files ?? [])]) void upload(f); e.target.value = ""; }} />
      <div className="sheet">
        {lost && <p className="notice warn" role="alert"><I.Lock />{format(t.editor.lost, { name: lost.name })}</p>}
        {start.older && !lost && <p className="notice" role="status">{t.editor.olderBase}</p>}
        {error && <p className="notice warn" role="alert">{error}</p>}
        <label htmlFor="page-title" className="visually-hidden">{t.editor.title}</label>
        <textarea
          id="page-title"
          className="title-input"
          rows={1}
          value={title}
          maxLength={200}
          placeholder={t.editor.titlePlaceholder}
          onChange={e => { const v = e.target.value.replace(/\n/gu, " "); setTitle(v); titleRef.current = v; changed(); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); editor?.commands.focus("start"); } }}
        />
        <EditorContent editor={editor} />
      </div>
      {editor && <LinkDialog open={linkOpen} editor={editor} onClose={() => setLinkOpen(false)} t={t} />}
      {editor && <PagePicker open={pickOpen} pages={pages.filter(p => p.id !== page.id)} onClose={() => setPickOpen(false)} onPick={id => { editor.chain().focus().insertPageRef(id).run(); setPickOpen(false); }} t={t} />}
    </div>
  );
}

// The formatting bar: what most pages need, in plain words for screen
// readers and tooltips; on a phone it scrolls sideways.
function Toolbar({ editor, t, onLink, onPick, onFile }: { editor: TiptapEditor; t: Words; onLink: () => void; onPick: () => void; onFile: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      style: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "paragraph",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      bullets: e.isActive("bulletList"),
      numbers: e.isActive("orderedList"),
      tasks: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      callout: e.isActive("callout"),
      tone: String(e.getAttributes("callout")["tone"] ?? "info"),
      table: e.isActive("table"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const tool = (label: string, icon: ReactNode, run: () => void, pressed?: boolean, disabled?: boolean) => (
    <button type="button" className="tool" title={label} aria-pressed={pressed} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={run}>
      {icon}<span className="visually-hidden">{label}</span>
    </button>
  );
  return (
    <div className="toolbar-wrap">
      <div className="toolbar" role="toolbar" aria-label={t.editor.toolbar}>
        <label className="visually-hidden" htmlFor="text-style">{t.editor.style}</label>
        <select id="text-style" className="style-select" value={s.style} onChange={e => {
          const v = e.target.value;
          if (v === "paragraph") c().setParagraph().run();
          else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}>
          <option value="paragraph">{t.editor.styles.paragraph}</option>
          <option value="h1">{t.editor.styles.h1}</option>
          <option value="h2">{t.editor.styles.h2}</option>
          <option value="h3">{t.editor.styles.h3}</option>
        </select>
        <span className="sep" />
        {tool(t.editor.bold, <I.Bold />, () => c().toggleBold().run(), s.bold)}
        {tool(t.editor.italic, <I.Italic />, () => c().toggleItalic().run(), s.italic)}
        {tool(t.editor.strike, <I.Strike />, () => c().toggleStrike().run(), s.strike)}
        {tool(t.editor.code, <I.Code />, () => c().toggleCode().run(), s.code)}
        <span className="sep" />
        {tool(t.editor.link, <I.Link />, onLink, s.link)}
        {tool(t.editor.pageLink, <I.PageLink />, onPick)}
        <span className="sep" />
        {tool(t.editor.bullets, <I.Bullets />, () => c().toggleBulletList().run(), s.bullets)}
        {tool(t.editor.numbers, <I.Numbers />, () => c().toggleOrderedList().run(), s.numbers)}
        {tool(t.editor.checklist, <I.CheckList />, () => c().toggleTaskList().run(), s.tasks)}
        {tool(t.editor.quote, <I.Quote />, () => c().toggleBlockquote().run(), s.quote)}
        {tool(t.editor.callout, <I.Note />, () => c().toggleCallout().run(), s.callout)}
        <span className="sep" />
        {tool(t.editor.table, <I.Table />, () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), s.table, s.table)}
        {tool(t.editor.image, <I.Image />, onFile)}
        {tool(t.editor.divider, <I.Divider />, () => c().setHorizontalRule().run())}
        <span className="sep" />
        {tool(t.editor.undo, <I.Undo />, () => c().undo().run(), undefined, !s.undo)}
        {tool(t.editor.redo, <I.Redo />, () => c().redo().run(), undefined, !s.redo)}
      </div>
      {(s.table || s.callout) && (
        <div className="toolbar sub" role="toolbar" aria-label={s.table ? t.editor.tableTools : t.editor.calloutTone}>
          {s.table && (
            <>
              <button type="button" className="chip" onClick={() => c().addRowAfter().run()}>{t.editor.addRow}</button>
              <button type="button" className="chip" onClick={() => c().addColumnAfter().run()}>{t.editor.addColumn}</button>
              <button type="button" className="chip" onClick={() => c().deleteRow().run()}>{t.editor.deleteRow}</button>
              <button type="button" className="chip" onClick={() => c().deleteColumn().run()}>{t.editor.deleteColumn}</button>
              <button type="button" className="chip danger" onClick={() => c().deleteTable().run()}>{t.editor.deleteTable}</button>
            </>
          )}
          {s.callout && !s.table && (["info", "tip", "warning"] as const).map(tone => (
            <button key={tone} type="button" className={`chip tone-${tone}`} aria-pressed={s.tone === tone} onClick={() => c().setCalloutTone(tone).run()}>{t.editor.tones[tone]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkDialog({ open, editor, onClose, t }: { open: boolean; editor: TiptapEditor; onClose: () => void; t: Words }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    if (open) {
      setValue(String(editor.getAttributes("link")["href"] ?? ""));
      setError(false);
    }
  }, [open, editor]);
  function apply() {
    let href = value.trim();
    if (href && !/^[a-z]+:|^\/|^#/iu.test(href)) href = (href.includes("@") && !href.includes("/") ? "mailto:" : "https://") + href;
    const safe = safeHref(href);
    if (!safe) return setError(true);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href: safe } }] }).run();
    else chain.setLink({ href: safe }).run();
    onClose();
  }
  return (
    <Dialog open={open} title={t.editor.linkTitle} closeLabel={t.common.close} onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); apply(); }}>
        <div>
          <label className="label" htmlFor="link-href">{t.editor.linkAddress}</label>
          <input id="link-href" className="field" value={value} onChange={e => setValue(e.target.value)} placeholder={t.editor.linkPlaceholder} autoFocus inputMode="url" aria-invalid={error} aria-describedby={error ? "link-error" : undefined} />
        </div>
        {error && <p id="link-error" className="error" role="alert">{t.editor.linkInvalid}</p>}
        <div className="dialog-foot">
          {editor.isActive("link") && <button type="button" className="button quiet" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onClose(); }}>{t.editor.linkRemove}</button>}
          <button type="submit" className="button">{t.editor.linkApply}</button>
        </div>
      </form>
    </Dialog>
  );
}

// "Link to a page": find it by its title (accents aside), pick it; the
// link shows the page's current title, whatever it becomes.
function PagePicker({ open, pages, onClose, onPick, t }: { open: boolean; pages: PickPage[]; onClose: () => void; onPick: (id: string) => void; t: Words }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const found = pages.filter(p => plain(p.title + " " + p.space).includes(plain(q.trim()))).slice(0, 50);
  return (
    <Dialog open={open} title={t.editor.pickTitle} closeLabel={t.common.close} onClose={onClose}>
      <div className="stack">
        <label className="visually-hidden" htmlFor="pick-q">{t.editor.pickSearch}</label>
        <input id="pick-q" className="field" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.editor.pickSearch} autoFocus autoComplete="off"
          onKeyDown={e => { if (e.key === "Enter" && found[0]) { e.preventDefault(); onPick(found[0].id); } }} />
        {found.length === 0 ? <p className="muted">{t.editor.pickNone}</p> : (
          <ul className="pick-list">
            {found.map(p => (
              <li key={p.id}><button type="button" onClick={() => onPick(p.id)}><I.Page /><span>{p.title}</span><span className="muted">{p.space}</span></button></li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
