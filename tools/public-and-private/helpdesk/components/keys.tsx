"use client";

import { Dialog } from "@argentic/chest-ui/components";
import type { DialogWords } from "@argentic/chest-ui/components/logic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Keyboard shortcuts for those who answer all day (as in Help Scout or
// Zendesk): j/k move in the inbox, Enter opens, x ticks, r reply, n note,
// e close, c a new ticket, / search (the kit's SearchBox), ? this list —
// in the kit's dialog. Never while typing in a field.
export function isTyping(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

// busy: the key belongs to something else — a field, or a dialog open
// over the page (the shortcuts sheet, a confirmation).
export function busy(e: KeyboardEvent): boolean {
  return isTyping(e) || document.querySelector("dialog[open]") !== null;
}

export type KeyWords = {
  keys: string;
  keysClose: string;
  keyList: Record<"next" | "previous" | "open" | "select" | "reply" | "note" | "close" | "create" | "search" | "help", string>;
  dialog: DialogWords;
};

export function Keys({ canCreate, t }: { canCreate: boolean; t: KeyWords }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      // A dialog of the page is open: its keys are its own.
      if (!open && document.querySelector("dialog[open]")) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === "c" && canCreate && !open) {
        e.preventDefault();
        router.push("/chest/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCreate, router, open]);
  const rows: [string, keyof KeyWords["keyList"]][] = [["j", "next"], ["k", "previous"], ["Enter", "open"], ["x", "select"], ["r", "reply"], ["n", "note"], ["e", "close"], ["c", "create"], ["/", "search"], ["?", "help"]];
  return (
    <Dialog open={open} title={t.keys} onClose={() => setOpen(false)} size="s" className="keys" labels={t.dialog}
      footer={<button type="button" className="ck-button ck-button-quiet" onClick={() => setOpen(false)}>{t.keysClose}</button>}>
      <dl>{rows.map(([key, what]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{t.keyList[what]}</dd></div>)}</dl>
    </Dialog>
  );
}
