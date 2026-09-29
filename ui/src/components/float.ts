// useFloat: a popover (the people picker's list, the date field's calendar,
// a menu) that must not be cut at the edge of what scrolls around it. Inside
// a <dialog>, a table's scrolling frame (.ck-table-wrap) or any box whose
// overflow is not visible, an absolutely placed popover was clipped at that
// box's edge. There, the popover is placed `fixed` against the viewport,
// under its field (or above it when there is no room below), and follows it
// when anything scrolls or the window changes size. A fixed element escapes
// its ancestors' overflow (a dialog is in the top layer, so it stays on
// top). Outside such a box — or under a transformed ancestor, where `fixed`
// would not mean the viewport — nothing changes: the CSS places it.
//
// Positions are set through the CSSOM (element.style), never a style
// attribute: the studio's style policy (nonces, no inline style) allows it.
import { useLayoutEffect, type RefObject } from "react";

// clipped: is the element inside a box that would cut a popover — and may
// a fixed popover escape it?
function clipped(el: HTMLElement): boolean {
  let found = false;
  for (let node = el.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const s = getComputedStyle(node);
    // `fixed` is then relative to this box, not the viewport: leave it.
    if (s.transform !== "none" || s.filter !== "none" || /paint|layout|strict|content/u.test(s.contain) || s.willChange.includes("transform")) return false;
    if (node.tagName === "DIALOG" || s.overflowX !== "visible" || s.overflowY !== "visible") found = true;
  }
  return found;
}

export function useFloat(anchor: RefObject<HTMLElement | null>, float: RefObject<HTMLElement | null>, open: boolean, { matchWidth = false, scroll = true, align = "start", gap = 4 }: { matchWidth?: boolean; scroll?: boolean; align?: "start" | "end"; gap?: number } = {}): void {
  useLayoutEffect(() => {
    const a = anchor.current;
    const f = float.current;
    if (!open || !a || !f || !clipped(a)) return;
    const place = () => {
      const r = a.getBoundingClientRect();
      const width = matchWidth ? r.width : f.offsetWidth;
      const height = f.offsetHeight;
      const below = window.innerHeight - r.bottom - gap;
      const above = r.top - gap;
      const top = below >= height || below >= above ? r.bottom + gap : Math.max(gap, r.top - gap - height);
      const wanted = align === "end" ? r.right - width : r.left;
      const left = Math.max(gap, Math.min(wanted, window.innerWidth - width - gap));
      f.style.position = "fixed";
      f.style.top = `${Math.round(top)}px`;
      f.style.left = `${Math.round(left)}px`;
      f.style.right = "auto";
      f.style.margin = "0";
      if (matchWidth) f.style.width = `${Math.round(width)}px`;
      // No room either side: a list scrolls within what is left.
      if (scroll) f.style.maxHeight = `min(320px, 50vh, ${Math.max(120, Math.round(Math.max(below, above)))}px)`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      for (const p of ["position", "top", "left", "right", "margin", "width", "maxHeight"] as const) f.style[p] = "";
    };
  });
}
