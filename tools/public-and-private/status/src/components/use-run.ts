import { call, toast } from "@argentic/chest-app/client";
import { useCallback, useState } from "react";

// useRun calls an action of src/actions.ts (call(): a refusal is said in
// words, a toast in the reader's language, read at once by screen readers;
// the page is read again after a success), says a success when given its
// words, and tells whether it is still running — so every button of the
// team's part behaves the same.
type Name = Parameters<typeof call>[0];
type Input<N extends Name> = Parameters<typeof call<N>>[1];
type Value<N extends Name> = Extract<Awaited<ReturnType<typeof call<N>>>, { ok: true }>["value"];

export function useRun() {
  const [pending, setPending] = useState(false);
  // done: the words of a success (a toast), or what to do with its value.
  // refresh: false when done goes to another page (navigate()).
  const run = useCallback(async <N extends Name>(name: N, input: Input<N>, done?: string | ((value: Value<N>) => void), options: { refresh?: boolean } = {}) => {
    setPending(true);
    try {
      const outcome = await call(name, input, options);
      if (outcome.ok) {
        if (typeof done === "string") toast(done);
        else done?.(outcome.value as Value<N>);
      }
      return outcome;
    } finally {
      setPending(false);
    }
  }, []);
  // The Undo of a toast (the kit's): runs the action that puts things
  // back (the page is read again), and says in words why it could not.
  const undo = useCallback(<N extends Name>(name: N, input: Input<N>) => async (): Promise<true | string> => {
    const outcome = await call(name, input, { quiet: true });
    return outcome.ok || outcome.message;
  }, []);
  return { run, pending, undo };
}
