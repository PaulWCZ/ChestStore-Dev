import { useEffect } from "react";

// Keyboard shortcuts for those who answer all day (as in Help Scout or
// Zendesk): j/k move in the inbox, Enter opens, x ticks, r reply, n note,
// e close, c a new ticket, / search (the kit's SearchBox), ? the list.
// Never while typing in a field, never under a dialog.
//
// Never either before the whole page is live: on a cold visit the islands
// come alive one by one, and a key that reached one while the next was
// still plain HTML (a reply box, the bulk bar) would act on half a page.
// Every island counts itself once mounted (src/islands/index.ts wraps each
// in useLive); the keys wait for all of the page's.
let mounted = 0;
export function useLive(): void {
  useEffect(() => {
    mounted++;
    return () => {
      mounted--;
    };
  }, []);
}
export const pageLive = (): boolean => mounted >= document.querySelectorAll("[data-island]").length;

export function isTyping(e: KeyboardEvent): boolean {
  if (!pageLive()) return true;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

// busy: the key belongs to something else — a field, or a dialog open
// over the page (the shortcuts sheet, a confirmation).
export function busy(e: KeyboardEvent): boolean {
  return isTyping(e) || document.querySelector("dialog[open]") !== null;
}
