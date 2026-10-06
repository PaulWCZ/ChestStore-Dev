import { useCallback, useRef, useState } from "react";

// A piece of work on its way (an action called): `busy` while it runs, for
// a button's disabled state and its "Saving…"; a second start while the
// first runs is ignored (a double click sends once).
export function useBusy(): [boolean, <T>(work: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await work();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}

// Work that may run side by side (a file's preview read again after each
// choice): `working` while any runs; `latest(ticket)` says whether an
// answer is still the newest asked (an older one arriving late is
// dropped).
export function useWorking(): { working: boolean; track: <T>(work: () => Promise<T>) => Promise<{ value: T; latest: boolean }> } {
  const [count, setCount] = useState(0);
  const asked = useRef(0);
  const track = useCallback(async <T,>(work: () => Promise<T>) => {
    const ticket = ++asked.current;
    setCount(n => n + 1);
    try {
      const value = await work();
      return { value, latest: ticket === asked.current };
    } finally {
      setCount(n => n - 1);
    }
  }, []);
  return { working: count > 0, track };
}
