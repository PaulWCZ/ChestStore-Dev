import { useCallback, useState } from "react";

// [pending, start]: an island's step (an action, then the page read again)
// with a flag while it is on its way — the buttons say "busy" by being
// disabled. start(run) runs it; a press while one is on its way is
// ignored (the package runs actions one at a time anyway).
export function useStep(): [boolean, (run: () => Promise<unknown>) => void] {
  const [pending, setPending] = useState(false);
  const start = useCallback((run: () => Promise<unknown>) => {
    setPending(true);
    void run().finally(() => setPending(false));
  }, []);
  return [pending, start];
}
