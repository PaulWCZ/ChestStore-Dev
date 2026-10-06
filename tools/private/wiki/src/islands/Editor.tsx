import { call, fill as format } from "@argentic/chest-app/client";
import type { DialogWords } from "@argentic/chest-ui/components/logic";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { Holder } from "../actions.ts";
import * as I from "../components/icons.tsx";
import type { Catalogue } from "../i18n/index.ts";
import { heartbeatSeconds } from "../shared/model.ts";

// Editing a page: the lock first (one person edits at a time), then the
// page as it is — or the member's own unsaved draft, which comes back.
// Rendering the page takes nothing: the lock is asked for once the editor
// is on screen (a link opened in passing never locks a page). The editor
// itself (Tiptap: ./editor/Writing.tsx) is a script of its own, fetched
// then; the server renders only its frame.
export type EditorWords = { editor: Catalogue["editor"]; common: Catalogue["common"]; dialog: DialogWords; missing: string; tooLarge: string; unknown: string };
// The page as it is; doc: its document as JSON (a page's document is
// data, not a plain object to the types of an island's props).
export type PageInfo = { id: string; title: string; doc: string; version: number };
export type PickPage = { id: string; title: string; space: string };
// Where the writing starts: the page, or the member's draft (restored: when
// it was kept, in their zone; older: the page changed since).
export type Start = { title: string; doc: unknown; base: number; restored: string | null; older: boolean };

// Never in the server's build: the server renders only the frame (the
// editor opens in the browser, after the lock).
const Writing = import.meta.env.SSR ? ((() => null) as unknown as ReturnType<typeof lazy<typeof import("./editor/Writing.tsx").default>>) : lazy(() => import("./editor/Writing.tsx"));

type Phase = { kind: "opening" } | ({ kind: "editing" } & Start) | { kind: "locked"; holder: Holder };

export function Editor({ page, pages, fresh = false, locale, t }: { page: PageInfo; pages: PickPage[]; fresh?: boolean; locale: string; t: EditorWords }) {
  const [phase, setPhase] = useState<Phase>({ kind: "opening" });
  const [error, setError] = useState<string | null>(null);
  const open = useCallback(async (takeOver = false) => {
    setError(null);
    const result = await call("openEditor", { pageId: page.id, takeOver }, { refresh: false, quiet: true });
    if (!result.ok) return setError(result.message);
    const o = result.value;
    if (o.status === "locked") return setPhase({ kind: "locked", holder: o.holder });
    setPhase(o.draft
      ? { kind: "editing", title: o.draft.title, doc: JSON.parse(o.draft.doc) as unknown, base: o.draft.baseVersion, restored: o.draft.time, older: o.draft.baseVersion < o.version }
      : { kind: "editing", title: page.title, doc: JSON.parse(page.doc) as unknown, base: o.version, restored: null, older: false });
  }, [page]);
  useEffect(() => { void open(); }, [open]);
  // Waiting behind someone else's lock: asked again every 30 seconds — the
  // editor opens by itself once the page is free, and the holder's line
  // stays current.
  const waiting = phase.kind === "locked";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void open(), heartbeatSeconds * 1000);
    return () => clearInterval(timer);
  }, [waiting, open]);

  if (phase.kind === "opening") {
    return <div className="opening" role="status">{error ? <p className="error" role="alert">{error}</p> : <p className="muted">{t.editor.opening}</p>}</div>;
  }
  if (phase.kind === "locked") {
    const h = phase.holder;
    return (
      <div className="locked">
        <I.Lock />
        <h1>{t.editor.lockedTitle}</h1>
        <p>{h.idle ? format(t.editor.lockedIdle, { name: h.name, time: h.time, minutes: h.minutes }) : format(t.editor.locked, { name: h.name, time: h.time })}</p>
        {h.idle && <p className="muted">{t.editor.takeOverHint}</p>}
        <div className="row-actions">
          {h.idle && <button type="button" className="button" onClick={() => void open(true)}>{t.editor.takeOver}</button>}
          <a className={h.idle ? "button quiet" : "button"} href={`/chest/pages/${page.id}`}>{t.editor.backToPage}</a>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }
  const { kind: _, ...start } = phase;
  return (
    <Suspense fallback={<div className="opening" role="status"><p className="muted">{t.editor.opening}</p></div>}>
      <Writing key={start.base + ":" + start.title} page={page} start={start} pages={pages} fresh={fresh} locale={locale} t={t} />
    </Suspense>
  );
}
