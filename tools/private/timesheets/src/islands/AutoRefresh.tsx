import { refresh } from "@argentic/chest-app/client";
import { useEffect } from "react";

// The Chest has no WebSocket: a page is read again when the person comes
// back to it — the tab shown again, the window focused — so a timer
// started on another device, a week approved meanwhile, show up. Never on
// a timer: a tab left open all day would keep the tool awake and re-run
// the Reports' and Team's queries for nobody. Once per `seconds` at most;
// refresh() changes only what changed (what is typed, the focus, the
// scroll stay).
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  useEffect(() => {
    let last = Date.now();
    const back = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < seconds * 1000) return;
      last = Date.now();
      void refresh();
    };
    document.addEventListener("visibilitychange", back);
    addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      removeEventListener("focus", back);
    };
  }, [seconds]);
  return null;
}
