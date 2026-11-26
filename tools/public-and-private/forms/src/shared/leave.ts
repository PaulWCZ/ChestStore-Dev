// Safe in the browser only (islands): a page with changes not saved yet
// (the builder, the settings) saves them before one of the tool's links
// leaves it — the form's tabs, the way back, any link of the page —, so
// switching tab never throws an edit away. A capture listener runs before
// the package's own (which then sees the click handled): it waits for the
// save, then goes where the link went (in place, as the package would);
// a save that fails keeps the page, which says why. A link the browser
// handles itself (another site, a new tab, a download, a modifier key)
// is let through: the page's keepalive save covers it.
import { navigate } from "@argentic/chest-app/client";

export function guardLinks(waiting: () => boolean, flush: () => Promise<boolean>): () => void {
  const onClick = (event: MouseEvent) => {
    if (!waiting() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const to = new URL(link.href, location.href);
    if (to.origin !== location.origin || (to.pathname === location.pathname && to.hash)) return;
    event.preventDefault();
    event.stopPropagation();
    void flush().then(ok => {
      if (ok) void navigate(to.pathname + to.search + to.hash);
    });
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

// The last save as the page goes away (a closed tab, a reload): sent with
// keepalive, which the browser finishes after the page is gone — to the
// same action a call() would reach, as call() sends it.
export function sendOnLeave(action: string, input: unknown): void {
  const body = JSON.stringify(input);
  void fetch(`/chest/actions/${action}`, { method: "POST", keepalive: body.length < 60_000, headers: { "content-type": "application/json", "x-tool-action": "1" }, body }).catch(() => undefined);
}
