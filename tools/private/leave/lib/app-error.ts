// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = [
  "forbidden", "not_found", "invalid", "too_long", "empty", "too_many",
  "bad_dates", "no_days", "too_far", "no_half_days", "overlap", "not_pending", "not_approved",
  "own_request", "no_notes", "approver_invalid", "import_invalid", "import_empty", "last_type",
  "number_taken", "not_enough", "no_event", "left_company", "overlap_someone", "bad_code",
  "unavailable", "unknown",
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
