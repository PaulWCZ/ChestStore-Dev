// The keyboard of the kit's widgets as pure functions: what a key does to
// the active item. The components only apply the answer, so the behaviour
// is tested without a browser.

export type ListMove = { active: number; open: boolean; choose?: boolean; close?: boolean };

// listKey: a combobox's listbox (the ARIA 1.2 combobox pattern). Down opens
// the list or moves down (wrapping), Up moves up (wrapping), Enter chooses
// the active option, Escape closes (a second Escape is the field's), Tab
// closes and lets focus move on. Home and End stay the text field's.
export function listKey(state: { active: number; open: boolean }, count: number, key: string, alt = false): ListMove | null {
  const { active, open } = state;
  switch (key) {
    case "ArrowDown":
      if (!open || alt) return { active: open ? active : count > 0 ? 0 : -1, open: true };
      return { active: count === 0 ? -1 : (active + 1) % count, open: true };
    case "ArrowUp":
      if (!open) return { active: count > 0 ? count - 1 : -1, open: true };
      if (alt) return { active, open: false, close: true };
      return { active: count === 0 ? -1 : active <= 0 ? count - 1 : active - 1, open: true };
    case "Enter":
      if (open && active >= 0 && active < count) return { active, open: true, choose: true };
      return null;
    case "Escape":
      if (open) return { active: -1, open: false, close: true };
      return null;
    case "Tab":
      return open ? { active: -1, open: false, close: true } : null;
    default:
      return null;
  }
}

// menuKey: a menu (the ARIA menu button pattern). Arrows move and wrap,
// Home and End go to the ends, Escape and Tab close. A letter moves to the
// next item that starts with it (the labels are passed for that).
export function menuKey(active: number, labels: readonly string[], key: string): { active: number; close?: boolean } | null {
  const count = labels.length;
  if (count === 0) return key === "Escape" || key === "Tab" ? { active: -1, close: true } : null;
  switch (key) {
    case "ArrowDown": return { active: (active + 1) % count };
    case "ArrowUp": return { active: active <= 0 ? count - 1 : active - 1 };
    case "Home": return { active: 0 };
    case "End": return { active: count - 1 };
    case "Escape":
    case "Tab": return { active: -1, close: true };
    default: {
      if (key.length !== 1 || !/\p{L}|\p{N}/u.test(key)) return null;
      const k = key.toLocaleLowerCase();
      for (let i = 1; i <= count; i++) {
        const j = (active + i) % count;
        if ((labels[j] ?? "").trim().toLocaleLowerCase().startsWith(k)) return { active: j };
      }
      return { active };
    }
  }
}

// tabKey: a tab list with a roving focus (the ARIA tabs pattern):
// Left/Right (or Up/Down for a vertical list) move and wrap, Home/End go
// to the ends.
export function tabKey(active: number, count: number, key: string, vertical = false): number | null {
  if (count === 0) return null;
  const back = vertical ? "ArrowUp" : "ArrowLeft";
  const forward = vertical ? "ArrowDown" : "ArrowRight";
  if (key === forward) return (active + 1) % count;
  if (key === back) return active <= 0 ? count - 1 : active - 1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

// stripKey: a row of days with one Tab stop (DayStrip, 0.2.6): Left/Right
// move a day and stop at the ends (days do not wrap around: after the
// last day shown comes a later day, not the first), Home/End go to the
// ends. null: the key is not the strip's.
export function stripKey(active: number, count: number, key: string): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight") return Math.min(count - 1, active + 1);
  if (key === "ArrowLeft") return Math.max(0, active - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
