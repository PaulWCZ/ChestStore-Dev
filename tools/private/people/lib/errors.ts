import { CapabilityNotGranted, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";

import { AppError, type ErrorCode } from "./app-error.ts";

export { AppError, errorCodes, type ErrorCode } from "./app-error.ts";

// The answer of a server action: a value, or a code and the values its
// words need.
export type Result<T = null> = { ok: true; value: T } | { ok: false; error: ErrorCode; values?: Record<string, number | string> };

// attempt runs a step of a server action and turns what it refuses into a
// Result; the Chest being unreachable is "unavailable". Anything else is a
// bug: it is logged (without data) and answered "unknown".
export async function attempt<T>(step: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await step() };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code, values: error.values };
    if (error instanceof Unavailable || error instanceof RateLimited || error instanceof QuotaExceeded || error instanceof CapabilityNotGranted) return { ok: false, error: "unavailable" };
    console.error("unexpected error", error instanceof Error ? error.name + ": " + error.message : "non-error thrown");
    return { ok: false, error: "unknown" };
  }
}
