"use client";

import { useToast } from "@argentic/chest-ui/components";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ErrorCode } from "../lib/app-error.ts";
import type { Result } from "../lib/errors.ts";
import { format } from "../lib/i18n/format.ts";

// useRun calls a server action, says what went wrong in words (an error
// toast, the kit's: read at once by screen readers), refreshes the page's
// data, and tells whether it is still running — so every button of the
// team's part behaves the same.
export function useRun(errors: Record<ErrorCode, string>) {
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const run = useCallback(async <T,>(action: () => Promise<Result<T>>, done?: string | ((value: T) => void)): Promise<Result<T>> => {
    setPending(true);
    try {
      const result = await action();
      if (!result.ok) toast({ text: format(errors[result.error] ?? errors.unknown, result.values ?? {}), tone: "error" });
      else {
        if (typeof done === "string") toast(done);
        else if (done) done(result.value);
        router.refresh();
      }
      return result;
    } catch {
      toast({ text: errors.unavailable, tone: "error" });
      return { ok: false, error: "unavailable" };
    } finally {
      setPending(false);
    }
  }, [errors, router, toast]);
  // The Undo of a toast (the kit's): runs the action that puts things
  // back, refreshes the page, and says in words why it could not.
  const undo = useCallback((action: () => Promise<Result<unknown>>) => async (): Promise<true | string> => {
    try {
      const result = await action();
      if (!result.ok) return format(errors[result.error] ?? errors.unknown, result.values ?? {});
      router.refresh();
      return true;
    } catch {
      return errors.unavailable;
    }
  }, [errors, router]);
  return { run, pending, undo };
}
