import { useCallback, useState } from "react";

// A form's work on its way: `pending` while any task started here runs
// (a button says so and waits), `start` runs one.
export function useWork(): [boolean, (task: () => Promise<unknown>) => void] {
  const [running, setRunning] = useState(0);
  const start = useCallback((task: () => Promise<unknown>) => {
    setRunning(n => n + 1);
    void task().finally(() => setRunning(n => n - 1));
  }, []);
  return [running > 0, start];
}
