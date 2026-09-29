"use client";

import { EmptyState, useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ItemLine } from "../../../components/bits.tsx";
import { Check, Clipboard } from "../../../components/icons.tsx";
import type { Catalogue } from "../../../lib/i18n/index.ts";
import { format, plural } from "../../../lib/i18n/format.ts";
import type { Result } from "../../../lib/errors.ts";
import type { Row } from "../../../lib/view.ts";
import { closeInventory, markSeen, reopenInventory, startInventory, unmarkSeen } from "../actions.ts";

type Words = { inventory: Catalogue["inventory"]; errors: Catalogue["errors"]; common: Catalogue["common"] };

// The inventory under way. The box takes what a barcode scanner types (a
// tag, or the label's link) and Enter; each tick in the list does the same.
// The box keeps the focus, so a scanner can go on and on.
export function InventoryView({ open, seen, notSeen, t, locale }: { open: boolean; seen: Row[]; notSeen: Row[]; t: Words; locale: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);
  const w = t.inventory;
  const total = seen.length + notSeen.length;
  const fault = (r: { error: keyof Catalogue["errors"]; values?: Record<string, string | number> }) => format(t.errors[r.error], r.values);
  // An Undo that tells the truth: true when it worked, else why not.
  const undoing = (step: () => Promise<Result>) => async () => {
    const u = await step();
    router.refresh();
    return u.ok || fault(u);
  };

  function scan(input: { text?: string; itemId?: string }) {
    setError(null);
    start(async () => {
      const r = await markSeen(input);
      if (!r.ok) {
        setError(format(t.errors[r.error], r.values));
        return;
      }
      const v = r.value;
      toast({
        id: `seen-${v.id}`,
        text: v.outOfScope ? format(w.outOfScope, { tag: v.tag }) : v.already ? format(w.alreadyToast, { tag: v.tag }) : format(w.seenToast, { tag: v.tag, name: v.name }),
        ...(v.already || v.outOfScope ? {} : { undo: undoing(() => unmarkSeen(v.id)) }),
      });
      setText("");
      router.refresh();
      box.current?.focus();
    });
  }

  if (!open) {
    return (
      <EmptyState
        icon={<span className="empty-art"><Clipboard /></span>}
        title={w.idle}
        body={w.intro}
        action={<button type="button" className="button" disabled={pending} onClick={() => start(async () => {
          const r = await startInventory();
          if (!r.ok) return setError(format(t.errors[r.error], r.values));
          router.refresh();
        })}><Clipboard />{w.start}</button>}
        note={error ? <span className="error" role="alert">{error}</span> : undefined}
      />
    );
  }

  return (
    <div className="stack">
      <div className="panel scan-panel">
        <div className="seats-head">
          <p className="holder-line"><strong>{format(w.progress, { seen: seen.length, total })}</strong></p>
          <meter className="seats-meter" min={0} max={Math.max(total, 1)} value={seen.length} aria-label={format(w.progress, { seen: seen.length, total })} />
        </div>
        <form className="filter-q" onSubmit={e => { e.preventDefault(); if (text.trim()) scan({ text }); }}>
          <label htmlFor="scan-box" className="visually-hidden">{w.scan}</label>
          <input id="scan-box" ref={box} className="field mono" value={text} onChange={e => setText(e.target.value)} placeholder={w.scan} autoFocus autoComplete="off" spellCheck={false} maxLength={400} aria-describedby="scan-hint" />
          <button type="submit" className="button" disabled={pending || !text.trim()}><Check />{w.scanButton}</button>
        </form>
        <p id="scan-hint" className="hint">{w.scanHint}</p>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <section aria-labelledby="not-seen">
        <h2 id="not-seen" className="section-title">{w.notSeen} · {notSeen.length}</h2>
        {notSeen.length === 0 ? <p className="all-clear"><span aria-hidden="true">✓</span> {w.allSeen}</p> : (
          <ul className="lines">
            {notSeen.map(r => (
              <ItemLine key={r.id} row={r} lead={
                <label className="line-pick">
                  <input type="checkbox" checked={false} disabled={pending} onChange={() => scan({ itemId: r.id })} />
                  <span className="visually-hidden">{format(w.tick, { tag: r.tag })}</span>
                </label>
              } />
            ))}
          </ul>
        )}
      </section>
      {seen.length > 0 && (
        <details className="seen-list">
          <summary className="section-title">{w.seen} · {seen.length}</summary>
          <ul className="lines">
            {seen.map(r => (
              <ItemLine key={r.id} row={r} lead={
                <label className="line-pick">
                  <input type="checkbox" checked disabled={pending} onChange={() => start(async () => { await unmarkSeen(r.id); router.refresh(); })} />
                  <span className="visually-hidden">{format(w.tick, { tag: r.tag })}</span>
                </label>
              } />
            ))}
          </ul>
        </details>
      )}
      <div className="row end">
        <button type="button" className="button quiet" disabled={pending} onClick={() => start(async () => {
          const r = await closeInventory();
          if (!r.ok) return setError(format(t.errors[r.error], r.values));
          const closed = r.value;
          toast({ id: `close-${closed.id}`, text: plural(w.closed, closed.missing, locale), undo: undoing(() => reopenInventory(closed.id)) });
          router.push(`/chest/inventory/${closed.id}`);
        })}>{w.close}</button>
      </div>
    </div>
  );
}
