"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ErrorCode } from "../lib/app-error.ts";
import type { Result } from "../lib/errors.ts";
import { format } from "../lib/i18n/format.ts";
import { useToast } from "./toast.tsx";

// useRun calls a server action, says what went wrong in words (a toast),
// refreshes the page's data, and tells whether it is still running — so
// every button of the team's part behaves the same.
export function useRun(errors: Record<ErrorCode, string>) {
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const run = useCallback(async <T,>(action: () => Promise<Result<T>>, done?: string | ((value: T) => void)): Promise<Result<T>> => {
    setPending(true);
    try {
      const result = await action();
      if (!result.ok) toast(format(errors[result.error] ?? errors.unknown, result.values ?? {}));
      else {
        if (typeof done === "string") toast(done);
        else if (done) done(result.value);
        router.refresh();
      }
      return result;
    } catch {
      toast(errors.unavailable);
      return { ok: false, error: "unavailable" };
    } finally {
      setPending(false);
    }
  }, [errors, router, toast]);
  return { run, pending };
}
