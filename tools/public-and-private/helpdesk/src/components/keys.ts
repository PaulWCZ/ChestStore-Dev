// Keyboard shortcuts for those who answer all day (as in Help Scout or
// Zendesk): j/k move in the inbox, Enter opens, x ticks, r reply, n note,
// e close, c a new ticket, / search (the kit's SearchBox), ? the list.
// Never while typing in a field, never under a dialog.
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
