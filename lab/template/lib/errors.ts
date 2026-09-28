import { CapabilityNotGranted, QuotaExceeded, RateLimited, Unavailable } from "@argentic/chest-sdk/errors";

// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = ["forbidden", "not_found", "invalid", "too_long", "empty", "unavailable", "unknown"] as const;
export type ErrorCode = (typeof errorCodes)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly values: Record<string, number | string>;
  constructor(code: ErrorCode, values: Record<string, number | string> = {}) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.values = values;
  }
}

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
