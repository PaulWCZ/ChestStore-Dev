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
  "too_few",
  "duplicate",
  "bad_date",
  "bad_times",
  "past",
  "too_soon",
  "closed",
  "not_closed",
  "already",
  "not_asked",
  "locked",
  "no_group",
  "no_person",
  "slots_anonymous",
  "full",
  "nudged",
  "no_comments",
  "anonymous_final",
  "no_answer",
  "too_fast",
  "bad_email",
  "guests_full",
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
