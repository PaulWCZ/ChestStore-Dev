"use client";

import { useEffect, useState } from "react";

// The time zones the browser knows, for a picker. The server's list (Node)
// differs from the browser's: the first render shows only the current zone,
// the full list comes once in the browser (no hydration mismatch).
export function useZones(current: string): string[] {
  const [all, setAll] = useState<string[]>([]);
  useEffect(() => {
    setAll(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []);
  }, []);
  return all.includes(current) ? all : [current, ...all];
}
