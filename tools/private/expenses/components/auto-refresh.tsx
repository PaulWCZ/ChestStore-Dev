"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The Chest has no WebSocket: a page others change re-reads itself every
// few seconds while it is visible, and at once when it becomes visible again.
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      if (document.visibilityState === "visible") timer = setInterval(() => router.refresh(), seconds * 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);
  return null;
}
