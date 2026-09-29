// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = [
  "forbidden",
  "not_found",
  "invalid",
  "too_long",
  "empty",
  "too_many",
  "duplicate",
  "bad_duration",
  "bad_period",
  "locked",
  "several",
  "day_full",
  "not_offered",
  "no_timer",
  "timer_too_long",
  "future",
  "import_invalid",
  "import_too_big",
  "rate_locked",
  "week_submitted",
  "week_approved",
  "invoiced",
  "week_future",
  "week_state",
  "unavailable",
  "unknown",
] as const;
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
