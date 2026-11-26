import { useEffect } from "react";

// On a phone the form's Save bar sticks to the bottom of the screen: a
// field the person moves to (a tap, Tab, the keyboard's "next") may sit
// right under it, visible to the browser and so never scrolled. This
// scrolls the page just enough to keep the focused field above the bar —
// when it gains focus, and again when the on-screen keyboard resizes the
// view. Nothing happens where the bar does not stick (a wide screen).
export function useKeepFocusedAboveBar(): void {
  useEffect(() => {
    const gap = 16;
    function keep() {
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !field.matches("input, select, textarea, button, [tabindex]")) return;
      const form = field.closest("form");
      const bar = form?.querySelector<HTMLElement>(".save-bar");
      if (!bar || bar.contains(field) || getComputedStyle(bar).position !== "sticky") return;
      const barTop = bar.getBoundingClientRect().top;
      const bottom = field.getBoundingClientRect().bottom;
      const over = bottom + gap - barTop;
      if (over > 0) window.scrollBy({ top: over, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    const soon = () => requestAnimationFrame(keep);
    document.addEventListener("focusin", soon);
    window.visualViewport?.addEventListener("resize", soon);
    return () => {
      document.removeEventListener("focusin", soon);
      window.visualViewport?.removeEventListener("resize", soon);
    };
  }, []);
}
