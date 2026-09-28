// Safe in the browser: no SDK here.
// What a service refuses, as a code: the pages put it in words
// (lib/i18n, errors.<code>). Services never return sentences.
export const errorCodes = [
  "forbidden", "not_found", "invalid", "too_long", "empty", "too_many",
  "invalid_tag", "tag_taken", "invalid_money", "invalid_seats", "invalid_date",
  "not_available", "not_held", "already_there", "is_licence", "not_licence",
  "no_seats", "has_seat", "seats_below_used", "not_member", "category_in_use",
  "file_missing", "file_too_large", "import_invalid", "unavailable", "unknown",
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
